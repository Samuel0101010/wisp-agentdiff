import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { simpleGit } from "simple-git";
import { logHookEvent } from "./wrap/debug-log.js";
import { type AgentRecord, loadState, saveState } from "./wrap/state.js";
import { defaultBasePath } from "./wrap/worktree-manager.js";

export interface PruneOptions {
  repoRoot: string;
  /** Only prune worktrees older than this many hours. Default: 24 * 7 (one week). */
  olderThanHours?: number;
  /** Print the plan but do not execute. */
  dryRun?: boolean;
  /** Also prune anything regardless of age (overrides olderThanHours). */
  all?: boolean;
}

export interface PruneItem {
  kind: "fs-orphan" | "state-orphan" | "aged-out";
  agentId?: string;
  name?: string;
  /** Worktree path on disk (absolute). For state-orphans, the path recorded in state even if missing. */
  path: string;
  branch?: string;
  ageHours?: number;
  reason: string;
}

export interface PruneResult {
  scanned: { agents: number; fsWorktrees: number };
  candidates: PruneItem[];
  pruned: PruneItem[];
  /** In dry-run mode all candidates land here. Otherwise: items intentionally not pruned. */
  skipped: PruneItem[];
  errors: { item: PruneItem; message: string }[];
}

const DEFAULT_OLDER_THAN_HOURS = 24 * 7;

function normalize(p: string): string {
  const abs = resolve(p);
  try {
    return realpathSync.native ? realpathSync.native(abs) : realpathSync(abs);
  } catch {
    return abs;
  }
}

function scanFsWorktrees(basePath: string): Array<{ path: string; mtimeMs: number }> {
  if (!existsSync(basePath)) return [];
  let entries: string[];
  try {
    entries = readdirSync(basePath);
  } catch {
    return [];
  }
  const result: Array<{ path: string; mtimeMs: number }> = [];
  for (const entry of entries) {
    const full = resolve(basePath, entry);
    try {
      const st = statSync(full);
      if (!st.isDirectory()) continue;
      result.push({ path: normalize(full), mtimeMs: st.mtimeMs });
    } catch {
      // skip unreadable entries
    }
  }
  return result;
}

function ageHoursOf(iso: string, nowMs: number): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return (nowMs - t) / (1000 * 60 * 60);
}

function pathExistsSafely(p: string): boolean {
  try {
    return existsSync(p);
  } catch {
    return false;
  }
}

export async function runPrune(options: PruneOptions): Promise<PruneResult> {
  const repoRoot = resolve(options.repoRoot);
  const olderThanHours = options.olderThanHours ?? DEFAULT_OLDER_THAN_HOURS;
  const dryRun = options.dryRun === true;
  const all = options.all === true;
  const nowMs = Date.now();

  const state = loadState(repoRoot);
  const basePath = defaultBasePath(repoRoot);
  const fsList = scanFsWorktrees(basePath);

  const result: PruneResult = {
    scanned: { agents: state.agents.length, fsWorktrees: fsList.length },
    candidates: [],
    pruned: [],
    skipped: [],
    errors: [],
  };

  // Index registered paths for fs-orphan detection (normalized).
  const registeredPaths = new Set<string>();
  for (const a of state.agents) {
    if (a.path) registeredPaths.add(normalize(a.path));
  }

  // Classify state entries.
  const stateOrphans: AgentRecord[] = [];
  const agedOut: AgentRecord[] = [];
  const keptAgents: AgentRecord[] = [];

  for (const agent of state.agents) {
    const onDisk = pathExistsSafely(agent.path);
    if (!onDisk) {
      stateOrphans.push(agent);
      result.candidates.push({
        kind: "state-orphan",
        agentId: agent.id,
        name: agent.name,
        path: agent.path,
        branch: agent.branch,
        reason: "agent recorded in state but worktree path missing on disk",
      });
      continue;
    }
    const age = ageHoursOf(agent.createdAt, nowMs);
    if (all || age >= olderThanHours) {
      agedOut.push(agent);
      result.candidates.push({
        kind: "aged-out",
        agentId: agent.id,
        name: agent.name,
        path: agent.path,
        branch: agent.branch,
        ageHours: age,
        reason: all
          ? "--all: ignore age cutoff"
          : `worktree older than ${olderThanHours}h (age ${age.toFixed(1)}h)`,
      });
      continue;
    }
    keptAgents.push(agent);
  }

  // fs-orphans: directories under basePath not referenced by any state entry.
  const fsOrphans: Array<{ path: string; mtimeMs: number }> = [];
  for (const entry of fsList) {
    if (registeredPaths.has(entry.path)) continue;
    fsOrphans.push(entry);
    result.candidates.push({
      kind: "fs-orphan",
      path: entry.path,
      reason: "worktree directory not referenced by any state entry",
    });
  }

  if (dryRun) {
    result.skipped = [...result.candidates];
    logHookEvent(repoRoot, "prune.summary", {
      dryRun: true,
      scanned: result.scanned,
      candidates: result.candidates.length,
      stateOrphans: stateOrphans.length,
      fsOrphans: fsOrphans.length,
      agedOut: agedOut.length,
    });
    return result;
  }

  const git = simpleGit(repoRoot);

  // Build the set of agent ids to drop from state after we attempt pruning.
  const droppedAgentIds = new Set<string>();

  // Helper: run `git worktree remove --force <path>` then optionally delete branch.
  const removeOnDisk = async (item: PruneItem): Promise<void> => {
    try {
      await git.raw(["worktree", "remove", "--force", item.path]);
    } catch (err) {
      // Fall back to `worktree prune` — directory may already be gone.
      try {
        await git.raw(["worktree", "prune"]);
      } catch {
        // ignore — surfaced via the original error below
      }
      throw err;
    }
    if (item.branch) {
      try {
        await git.raw(["branch", "-D", item.branch]);
      } catch {
        // Branch may already be deleted; non-fatal.
      }
    }
  };

  // 1. state-orphans: just drop from state, no git ops (path doesn't exist).
  for (const agent of stateOrphans) {
    const item: PruneItem = {
      kind: "state-orphan",
      agentId: agent.id,
      name: agent.name,
      path: agent.path,
      branch: agent.branch,
      reason: "agent recorded in state but worktree path missing on disk",
    };
    // Best-effort branch cleanup — branch might still exist even if path doesn't.
    if (agent.branch) {
      try {
        await git.raw(["branch", "-D", agent.branch]);
      } catch {
        // ignore
      }
    }
    droppedAgentIds.add(agent.id);
    result.pruned.push(item);
  }

  // 2. fs-orphans: remove via git worktree remove --force.
  for (const orphan of fsOrphans) {
    const item: PruneItem = {
      kind: "fs-orphan",
      path: orphan.path,
      reason: "worktree directory not referenced by any state entry",
    };
    try {
      await git.raw(["worktree", "remove", "--force", orphan.path]);
      result.pruned.push(item);
    } catch (err) {
      result.errors.push({ item, message: err instanceof Error ? err.message : String(err) });
    }
  }

  // 3. aged-out: remove worktree + branch.
  for (const agent of agedOut) {
    const item: PruneItem = {
      kind: "aged-out",
      agentId: agent.id,
      name: agent.name,
      path: agent.path,
      branch: agent.branch,
      ageHours: ageHoursOf(agent.createdAt, nowMs),
      reason: `worktree older than ${olderThanHours}h`,
    };
    try {
      await removeOnDisk(item);
      droppedAgentIds.add(agent.id);
      result.pruned.push(item);
    } catch (err) {
      result.errors.push({ item, message: err instanceof Error ? err.message : String(err) });
    }
  }

  // Persist state with pruned agents removed.
  if (droppedAgentIds.size > 0) {
    const nextState = {
      ...state,
      agents: state.agents.filter((a) => !droppedAgentIds.has(a.id)),
    };
    saveState(repoRoot, nextState);
  }

  logHookEvent(repoRoot, "prune.summary", {
    dryRun: false,
    scanned: result.scanned,
    candidates: result.candidates.length,
    pruned: result.pruned.length,
    errors: result.errors.length,
    stateOrphans: stateOrphans.length,
    fsOrphans: fsOrphans.length,
    agedOut: agedOut.length,
  });

  return result;
}

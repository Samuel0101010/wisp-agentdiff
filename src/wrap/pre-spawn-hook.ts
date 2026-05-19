import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { logHookEvent } from "./debug-log.js";
import { dequeueOldestUnstale } from "./pending-tasks.js";
import { resolveOuterRepoRoot } from "./resolve-repo-root.js";
import { type AgentRecord, loadState, saveState, upsertAgent } from "./state.js";
import { ingestTranscriptTasks } from "./transcript-correlator.js";
import { WorktreeManager } from "./worktree-manager.js";

/**
 * Native Claude Code WorktreeCreate hook payload (stdin JSON).
 * docs: https://code.claude.com/docs/en/worktrees
 *
 * The `transcript_path` / `session_id` / `cwd` / `hook_event_name` fields are
 * observed in real Claude Code v2 payloads (see debug.log of a /plugin install
 * run). They are optional because older builds and synthetic tests omit them.
 */
export interface WorktreeCreatePayload {
  /** Worktree slug Claude wants. */
  name: string;
  /** Optional explicit base ref. */
  baseRef?: string;
  /** Optional subagent identifier when wrapping a Task call. */
  agentId?: string;
  /** Absolute path to the session JSONL transcript (used for subagent_type correlation). */
  transcript_path?: string;
  /** Claude Code session id. */
  session_id?: string;
  /** Claude Code reported working directory. */
  cwd?: string;
  /** Hook event name (e.g. "WorktreeCreate"). */
  hook_event_name?: string;
}

export interface WorktreeCreateResult {
  /** Absolute path to the new worktree — Claude reads this from stdout. */
  path: string;
  /** Branch name; included for downstream logging. */
  branch: string;
  /** Stable agent id we recorded in state. */
  agentId: string;
}

export interface PreSpawnDeps {
  repoRoot: string;
  now?: () => Date;
  manager?: WorktreeManager;
}

export async function handleWorktreeCreate(
  payload: WorktreeCreatePayload,
  deps: PreSpawnDeps,
): Promise<WorktreeCreateResult> {
  if (!payload.name) throw new Error("WorktreeCreate payload missing required `name`");
  const now = deps.now ?? (() => new Date());

  // Detect the nested-worktree state-leak: when Claude Code dispatches a
  // subagent while cwd is already inside an existing wisp-agentdiff worktree,
  // the naive git-toplevel returns the INNER worktree. Resolve to the OUTER
  // repo root before doing anything else so state, debug logs, and the new
  // worktree all hang off the same root the user actually runs `/review` in.
  const inputRoot = deps.repoRoot;
  const cwdHint = payload.cwd ?? inputRoot;
  const resolvedRoot = await resolveOuterRepoRoot(cwdHint);
  if (resolvedRoot !== inputRoot) {
    logHookEvent(resolvedRoot, "worktree-create.retargeted", {
      message: `[v1.4] nested wisp-agentdiff worktree detected; retargeting state from ${inputRoot} to ${resolvedRoot}`,
      inputRoot,
      cwdHint,
      resolvedRoot,
    });
  }
  const repoRoot = resolvedRoot;
  const manager = deps.manager ?? new WorktreeManager(repoRoot);

  const created = await manager.create({
    name: payload.name,
    ...(payload.baseRef !== undefined ? { baseRef: payload.baseRef } : {}),
  });

  const agentId = payload.agentId ?? `agent-${created.name}-${now().getTime().toString(36)}`;
  mkdirSync(dirname(created.path), { recursive: true });

  if (payload.transcript_path) {
    try {
      const added = await ingestTranscriptTasks(repoRoot, payload.transcript_path);
      logHookEvent(repoRoot, "transcript.ingested", {
        added,
        transcript: payload.transcript_path,
      });
    } catch (err) {
      logHookEvent(repoRoot, "transcript.ingest-error", {
        transcript: payload.transcript_path,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Correlate with the most recent Task tool_use so the TUI can show a
  // friendly subagent_type label instead of the opaque worktree slug.
  const pending = dequeueOldestUnstale(repoRoot);
  const displayLabel = pending?.subagentType;

  const record: AgentRecord = {
    id: agentId,
    name: created.name,
    path: created.path,
    branch: created.branch,
    baseRef: created.baseRef,
    createdAt: now().toISOString(),
    status: "running",
    ...(displayLabel !== undefined ? { displayLabel } : {}),
  };

  let state = loadState(repoRoot);
  state = upsertAgent(state, record);
  saveState(repoRoot, state);

  logHookEvent(repoRoot, "worktree-create.label-correlated", {
    matched: displayLabel !== undefined,
    ...(displayLabel !== undefined ? { displayLabel } : {}),
  });

  logHookEvent(repoRoot, "worktree-create.registered", {
    agentId,
    name: created.name,
    path: created.path,
    branch: created.branch,
    baseRef: created.baseRef,
    payloadKeys: Object.keys(payload),
  });

  return { path: created.path, branch: created.branch, agentId };
}

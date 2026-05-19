import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { logHookEvent } from "./debug-log.js";
import { type AgentRecord, diffStoragePath, loadState, saveState, upsertAgent } from "./state.js";
import { WorktreeManager } from "./worktree-manager.js";

/**
 * Native Claude Code WorktreeRemove hook payload (stdin JSON).
 */
export interface WorktreeRemovePayload {
  name: string;
  /** Optional, when Claude already knows the agent it ran. */
  agentId?: string;
  /** If true, we keep the worktree on disk (review-only flow). */
  keep?: boolean;
  /** Optional transcript path the wrapper recorded. */
  transcriptPath?: string;
}

export interface WorktreeRemoveResult {
  agentId: string;
  removed: boolean;
  diffPath: string;
  filesChanged: number;
}

export interface PostSpawnDeps {
  repoRoot: string;
  now?: () => Date;
  manager?: WorktreeManager;
}

export async function handleWorktreeRemove(
  payload: WorktreeRemovePayload,
  deps: PostSpawnDeps,
): Promise<WorktreeRemoveResult> {
  if (!payload.name) throw new Error("WorktreeRemove payload missing required `name`");
  const now = deps.now ?? (() => new Date());
  const manager = deps.manager ?? new WorktreeManager(deps.repoRoot);

  let state = loadState(deps.repoRoot);
  const agent =
    (payload.agentId ? state.agents.find((a) => a.id === payload.agentId) : undefined) ??
    state.agents.find((a) => a.name === payload.name);

  if (!agent) {
    logHookEvent(deps.repoRoot, "worktree-remove.no-agent", {
      name: payload.name,
      agentIdHint: payload.agentId ?? null,
      knownAgents: state.agents.map((a) => ({ id: a.id, name: a.name })),
    });
    throw new Error(`no recorded agent for worktree '${payload.name}'`);
  }

  const worktreeExists = existsSync(agent.path);
  const commitSha = await manager
    .commitPending(agent.path, "wisp-agentdiff: capture subagent edits")
    .catch((err) => {
      logHookEvent(deps.repoRoot, "worktree-remove.commit-error", {
        agentId: agent.id,
        path: agent.path,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    });

  const unified = await manager.diffAgainst(agent.branch, agent.baseRef);
  const nameStatus = await manager.diffNameStatus(agent.branch, agent.baseRef);
  const filesChanged = nameStatus.split(/\r?\n/).filter((l) => l.trim().length > 0).length;

  logHookEvent(deps.repoRoot, "worktree-remove.captured", {
    agentId: agent.id,
    name: agent.name,
    path: agent.path,
    worktreeExisted: worktreeExists,
    autoCommitSha: commitSha,
    filesChanged,
    diffEmpty: unified.length === 0,
    diffBytes: unified.length,
  });

  const diffPath = diffStoragePath(deps.repoRoot, agent.id);
  mkdirSync(dirname(diffPath), { recursive: true });
  const payloadOut = {
    agentId: agent.id,
    branch: agent.branch,
    baseRef: agent.baseRef,
    capturedAt: now().toISOString(),
    unified,
    nameStatus,
  };
  writeFileSync(diffPath, JSON.stringify(payloadOut, null, 2), "utf8");

  let removed = false;
  if (!payload.keep) {
    await manager.remove(agent.path, { force: true });
    removed = true;
  }

  const next: AgentRecord = {
    ...agent,
    completedAt: now().toISOString(),
    diffPath,
    ...(payload.transcriptPath ? { transcriptPath: payload.transcriptPath } : {}),
    status: removed ? "removed" : "captured",
  };
  state = upsertAgent(state, next);
  saveState(deps.repoRoot, state);

  return { agentId: agent.id, removed, diffPath, filesChanged };
}

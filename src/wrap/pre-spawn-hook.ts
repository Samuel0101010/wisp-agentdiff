import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { logHookEvent } from "./debug-log.js";
import { dequeueOldestUnstale } from "./pending-tasks.js";
import { type AgentRecord, loadState, saveState, upsertAgent } from "./state.js";
import { WorktreeManager } from "./worktree-manager.js";

/**
 * Native Claude Code WorktreeCreate hook payload (stdin JSON).
 * docs: https://code.claude.com/docs/en/worktrees
 */
export interface WorktreeCreatePayload {
  /** Worktree slug Claude wants. */
  name: string;
  /** Optional explicit base ref. */
  baseRef?: string;
  /** Optional subagent identifier when wrapping a Task call. */
  agentId?: string;
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
  const manager = deps.manager ?? new WorktreeManager(deps.repoRoot);

  const created = await manager.create({
    name: payload.name,
    ...(payload.baseRef !== undefined ? { baseRef: payload.baseRef } : {}),
  });

  const agentId = payload.agentId ?? `agent-${created.name}-${now().getTime().toString(36)}`;
  mkdirSync(dirname(created.path), { recursive: true });

  // Correlate with the most recent PreToolUse:Task event so the TUI can show
  // a friendly subagent_type label instead of the opaque worktree slug.
  const pending = dequeueOldestUnstale(deps.repoRoot);
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

  let state = loadState(deps.repoRoot);
  state = upsertAgent(state, record);
  saveState(deps.repoRoot, state);

  logHookEvent(deps.repoRoot, "worktree-create.label-correlated", {
    matched: displayLabel !== undefined,
    ...(displayLabel !== undefined ? { displayLabel } : {}),
  });

  logHookEvent(deps.repoRoot, "worktree-create.registered", {
    agentId,
    name: created.name,
    path: created.path,
    branch: created.branch,
    baseRef: created.baseRef,
    payloadKeys: Object.keys(payload),
  });

  return { path: created.path, branch: created.branch, agentId };
}

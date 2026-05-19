import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Pending-tasks buffer used to correlate Task tool_use events with the
 * subsequent `WorktreeCreate` event. Claude Code fires them back-to-back but
 * the worktree payload only carries an opaque slug — we want the
 * `subagent_type` (e.g. "wisp-self-test") so the TUI can display a friendly
 * label instead of a hex name.
 *
 * Two ingestion paths:
 *  - legacy `PreToolUse:Task` hook (kept for backwards compat)
 *  - transcript-based ingestion driven by `WorktreeCreate.transcript_path`
 *
 * `consumed` holds the most-recent `tool_use_id`s already drained so transcript
 * re-ingestion is idempotent across many WorktreeCreate calls in one session.
 *
 * FIFO. Entries TTL out so a stranded queue from an aborted run doesn't
 * mis-label later worktrees.
 */
export interface PendingTask {
  subagentType: string;
  description?: string;
  toolUseId?: string;
  queuedAt: string;
}

export interface PendingTasksState {
  version: 1;
  tasks: PendingTask[];
  consumed?: string[];
}

const PENDING_FILE = ".claude/wisp-agentdiff/pending-tasks.json";
const DEFAULT_TTL_MS = 60_000;
const CONSUMED_CAP = 200;

export function pendingTasksPath(repoRoot: string): string {
  return resolve(repoRoot, PENDING_FILE);
}

function freshPending(): PendingTasksState {
  return { version: 1, tasks: [] };
}

export function loadPending(repoRoot: string): PendingTasksState {
  const file = pendingTasksPath(repoRoot);
  if (!existsSync(file)) return freshPending();
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return freshPending();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return freshPending();
  }
  if (!isValidPending(parsed)) return freshPending();
  return parsed;
}

function isValidPending(value: unknown): value is PendingTasksState {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<PendingTasksState>;
  if (v.version !== 1) return false;
  if (!Array.isArray(v.tasks)) return false;
  if (v.consumed !== undefined && !Array.isArray(v.consumed)) return false;
  return true;
}

export function savePending(repoRoot: string, state: PendingTasksState): void {
  const file = pendingTasksPath(repoRoot);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
}

export function enqueueTask(repoRoot: string, task: PendingTask): void {
  const state = loadPending(repoRoot);
  state.tasks.push(task);
  savePending(repoRoot, state);
}

export function hasSeenToolUseId(state: PendingTasksState, id: string): boolean {
  if (!id) return false;
  if (state.consumed?.includes(id)) return true;
  for (const t of state.tasks) {
    if (t.toolUseId === id) return true;
  }
  return false;
}

function isStale(task: PendingTask, ttlMs: number, now: number): boolean {
  const ts = Date.parse(task.queuedAt);
  if (Number.isNaN(ts)) return true;
  return now - ts > ttlMs;
}

export function pruneStale(
  repoRoot: string,
  ttlMs = DEFAULT_TTL_MS,
  now: number = Date.now(),
): number {
  const state = loadPending(repoRoot);
  const before = state.tasks.length;
  state.tasks = state.tasks.filter((t) => !isStale(t, ttlMs, now));
  const pruned = before - state.tasks.length;
  if (pruned > 0) savePending(repoRoot, state);
  return pruned;
}

function rememberConsumed(state: PendingTasksState, id: string): void {
  if (!id) return;
  const list = state.consumed ?? [];
  list.push(id);
  if (list.length > CONSUMED_CAP) {
    list.splice(0, list.length - CONSUMED_CAP);
  }
  state.consumed = list;
}

export function dequeueOldestUnstale(
  repoRoot: string,
  ttlMs = DEFAULT_TTL_MS,
  now: number = Date.now(),
): PendingTask | null {
  const state = loadPending(repoRoot);
  state.tasks = state.tasks.filter((t) => !isStale(t, ttlMs, now));
  if (state.tasks.length === 0) {
    savePending(repoRoot, state);
    return null;
  }
  const next = state.tasks.shift() ?? null;
  if (next?.toolUseId) rememberConsumed(state, next.toolUseId);
  savePending(repoRoot, state);
  return next;
}

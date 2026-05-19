import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  dequeueOldestUnstale,
  enqueueTask,
  loadPending,
  pendingTasksPath,
  pruneStale,
  savePending,
} from "../src/wrap/pending-tasks.js";

describe("pending-tasks", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "wisp-pending-"));
  });
  afterEach(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // ignore — Windows handle hold
    }
  });

  it("enqueues and dequeues in FIFO order", () => {
    const t0 = Date.now();
    enqueueTask(root, { subagentType: "alpha", queuedAt: new Date(t0).toISOString() });
    enqueueTask(root, { subagentType: "beta", queuedAt: new Date(t0 + 1).toISOString() });
    enqueueTask(root, { subagentType: "gamma", queuedAt: new Date(t0 + 2).toISOString() });

    const first = dequeueOldestUnstale(root, 60_000, t0 + 3);
    expect(first?.subagentType).toBe("alpha");
    const second = dequeueOldestUnstale(root, 60_000, t0 + 3);
    expect(second?.subagentType).toBe("beta");
    const third = dequeueOldestUnstale(root, 60_000, t0 + 3);
    expect(third?.subagentType).toBe("gamma");
  });

  it("pruneStale removes entries older than TTL", () => {
    const t0 = 1_000_000;
    enqueueTask(root, { subagentType: "old", queuedAt: new Date(t0).toISOString() });
    enqueueTask(root, { subagentType: "fresh", queuedAt: new Date(t0 + 50_000).toISOString() });
    const pruned = pruneStale(root, 10_000, t0 + 60_000);
    expect(pruned).toBe(1);
    const remaining = loadPending(root).tasks;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.subagentType).toBe("fresh");
  });

  it("dequeueOldestUnstale returns null on empty buffer", () => {
    expect(dequeueOldestUnstale(root)).toBeNull();
  });

  it("dequeueOldestUnstale prunes stale entries before returning", () => {
    const t0 = 2_000_000;
    enqueueTask(root, { subagentType: "stale1", queuedAt: new Date(t0).toISOString() });
    enqueueTask(root, { subagentType: "stale2", queuedAt: new Date(t0 + 100).toISOString() });
    enqueueTask(root, { subagentType: "fresh", queuedAt: new Date(t0 + 90_000).toISOString() });
    const got = dequeueOldestUnstale(root, 30_000, t0 + 95_000);
    expect(got?.subagentType).toBe("fresh");
    // both stale dropped, buffer is now empty
    expect(loadPending(root).tasks).toHaveLength(0);
  });

  it("loadPending tolerates corrupted JSON", () => {
    const file = pendingTasksPath(root);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "{not json}", "utf8");
    const state = loadPending(root);
    expect(state).toEqual({ version: 1, tasks: [] });
  });

  it("loadPending tolerates missing file", () => {
    const state = loadPending(root);
    expect(state).toEqual({ version: 1, tasks: [] });
  });

  it("savePending + loadPending round-trips", () => {
    savePending(root, {
      version: 1,
      tasks: [{ subagentType: "x", queuedAt: new Date().toISOString() }],
    });
    expect(loadPending(root).tasks).toHaveLength(1);
  });
});

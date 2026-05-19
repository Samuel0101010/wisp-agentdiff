import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  dequeueOldestUnstale,
  enqueueTask,
  hasSeenToolUseId,
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

  it("dequeueOldestUnstale records toolUseId in consumed list", () => {
    const t0 = Date.now();
    enqueueTask(root, {
      subagentType: "alpha",
      toolUseId: "toolu_a",
      queuedAt: new Date(t0).toISOString(),
    });
    enqueueTask(root, {
      subagentType: "beta",
      toolUseId: "toolu_b",
      queuedAt: new Date(t0 + 1).toISOString(),
    });
    dequeueOldestUnstale(root, 60_000, t0 + 2);
    const after = loadPending(root);
    expect(after.consumed).toContain("toolu_a");
    expect(after.consumed).not.toContain("toolu_b");
    expect(hasSeenToolUseId(after, "toolu_a")).toBe(true);
    expect(hasSeenToolUseId(after, "toolu_b")).toBe(true); // still in tasks
  });

  it("consumed list is FIFO-trimmed at 200 entries", () => {
    const t0 = Date.now();
    // Pre-seed 199 consumed ids.
    const seed: string[] = [];
    for (let i = 0; i < 199; i++) seed.push(`old_${i}`);
    savePending(root, { version: 1, tasks: [], consumed: seed });

    // Drain 5 more — total would be 204, must cap at 200 keeping newest.
    for (let i = 0; i < 5; i++) {
      enqueueTask(root, {
        subagentType: `s${i}`,
        toolUseId: `new_${i}`,
        queuedAt: new Date(t0 + i).toISOString(),
      });
      dequeueOldestUnstale(root, 60_000, t0 + 10);
    }
    const consumed = loadPending(root).consumed ?? [];
    expect(consumed).toHaveLength(200);
    // Oldest 4 dropped, new ones retained at tail.
    expect(consumed).not.toContain("old_0");
    expect(consumed).not.toContain("old_3");
    expect(consumed).toContain("old_4");
    expect(consumed.slice(-5)).toEqual(["new_0", "new_1", "new_2", "new_3", "new_4"]);
  });
});

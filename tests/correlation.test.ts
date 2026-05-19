import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { enqueueTask, loadPending } from "../src/wrap/pending-tasks.js";
import { handleWorktreeCreate } from "../src/wrap/pre-spawn-hook.js";
import { loadState } from "../src/wrap/state.js";
import { type TempRepo, makeTempRepo } from "./helpers/temp-repo.js";

const TASK_FIXTURE = resolve(__dirname, "fixtures", "transcript-with-tasks.jsonl");

describe("PreToolUse → WorktreeCreate label correlation", () => {
  let repo: TempRepo;
  beforeEach(async () => {
    repo = await makeTempRepo();
  });
  afterEach(() => repo.cleanup());

  it("attaches displayLabel from the queued PreToolUse task", async () => {
    enqueueTask(repo.root, {
      subagentType: "alpha",
      queuedAt: new Date().toISOString(),
    });

    await handleWorktreeCreate({ name: "abc123", agentId: "agent-abc" }, { repoRoot: repo.root });

    const state = loadState(repo.root);
    expect(state.agents).toHaveLength(1);
    expect(state.agents[0]?.displayLabel).toBe("alpha");

    // Pending buffer drained.
    expect(loadPending(repo.root).tasks).toHaveLength(0);
  });

  it("leaves displayLabel undefined when no pending task is queued", async () => {
    await handleWorktreeCreate({ name: "naked", agentId: "agent-naked" }, { repoRoot: repo.root });

    const state = loadState(repo.root);
    expect(state.agents).toHaveLength(1);
    expect(state.agents[0]?.displayLabel).toBeUndefined();
    expect(state.agents[0]?.name).toBe("naked");
  });

  it("ingests subagent_type from transcript_path on WorktreeCreate", async () => {
    await handleWorktreeCreate(
      { name: "wt-alpha", agentId: "agent-1", transcript_path: TASK_FIXTURE },
      { repoRoot: repo.root },
    );

    const state = loadState(repo.root);
    expect(state.agents).toHaveLength(1);
    expect(state.agents[0]?.displayLabel).toBe("alpha");
    // alpha is drained, beta and gamma remain.
    const remaining = loadPending(repo.root).tasks;
    expect(remaining.map((t) => t.subagentType)).toEqual(["beta", "gamma"]);
  });

  it("two consecutive WorktreeCreates against the same transcript drain in FIFO order", async () => {
    await handleWorktreeCreate(
      { name: "wt-first", agentId: "agent-first", transcript_path: TASK_FIXTURE },
      { repoRoot: repo.root },
    );
    await handleWorktreeCreate(
      { name: "wt-second", agentId: "agent-second", transcript_path: TASK_FIXTURE },
      { repoRoot: repo.root },
    );

    const state = loadState(repo.root);
    const byId = new Map(state.agents.map((a) => [a.id, a]));
    expect(byId.get("agent-first")?.displayLabel).toBe("alpha");
    expect(byId.get("agent-second")?.displayLabel).toBe("beta");
    // gamma still queued — re-ingest was idempotent.
    expect(loadPending(repo.root).tasks.map((t) => t.subagentType)).toEqual(["gamma"]);
  });
});

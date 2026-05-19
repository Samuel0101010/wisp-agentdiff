import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { enqueueTask, loadPending } from "../src/wrap/pending-tasks.js";
import { handleWorktreeCreate } from "../src/wrap/pre-spawn-hook.js";
import { loadState } from "../src/wrap/state.js";
import { type TempRepo, makeTempRepo } from "./helpers/temp-repo.js";

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
});

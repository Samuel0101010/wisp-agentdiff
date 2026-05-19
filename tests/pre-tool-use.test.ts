import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadPending } from "../src/wrap/pending-tasks.js";
import { handlePreToolUse } from "../src/wrap/pre-tool-use-hook.js";

describe("handlePreToolUse", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "wisp-pretool-"));
  });
  afterEach(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("enqueues when a Task has subagent_type", () => {
    handlePreToolUse(
      {
        tool_name: "Task",
        tool_input: { subagent_type: "wisp-self-test", description: "smoke test" },
      },
      { repoRoot: root },
    );
    const state = loadPending(root);
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]?.subagentType).toBe("wisp-self-test");
    expect(state.tasks[0]?.description).toBe("smoke test");
  });

  it("no-ops for a Task without subagent_type", () => {
    handlePreToolUse(
      { tool_name: "Task", tool_input: { description: "no type" } },
      { repoRoot: root },
    );
    expect(loadPending(root).tasks).toHaveLength(0);
  });

  it("no-ops for non-Task tools", () => {
    handlePreToolUse(
      { tool_name: "Bash", tool_input: { subagent_type: "ignored" } },
      { repoRoot: root },
    );
    expect(loadPending(root).tasks).toHaveLength(0);
  });

  it("no-ops (no throw) on empty payload", () => {
    expect(() => handlePreToolUse({}, { repoRoot: root })).not.toThrow();
    expect(loadPending(root).tasks).toHaveLength(0);
  });

  it("no-ops on empty subagent_type string", () => {
    handlePreToolUse({ tool_name: "Task", tool_input: { subagent_type: "" } }, { repoRoot: root });
    expect(loadPending(root).tasks).toHaveLength(0);
  });
});

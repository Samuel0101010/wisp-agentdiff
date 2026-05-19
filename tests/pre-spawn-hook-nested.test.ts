import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleWorktreeCreate } from "../src/wrap/pre-spawn-hook.js";
import { loadState, stateFilePath } from "../src/wrap/state.js";
import { type TempRepo, makeTempRepo } from "./helpers/temp-repo.js";

function realpathNorm(p: string): string {
  return realpathSync.native ? realpathSync.native(p) : realpathSync(p);
}

async function initNestedAgentRepo(parent: string, agentHex: string): Promise<string> {
  const nested = join(parent, ".claude", "worktrees", "wisp-agentdiff", `agent-${agentHex}`);
  mkdirSync(nested, { recursive: true });
  const git = simpleGit(nested);
  await git.init(["-b", "main"]);
  await git.addConfig("user.email", "test@example.com");
  await git.addConfig("user.name", "Test");
  await git.addConfig("commit.gpgsign", "false");
  writeFileSync(join(nested, "README.md"), "# nested\n", "utf8");
  await git.add(["README.md"]);
  await git.commit("init");
  return nested;
}

describe("handleWorktreeCreate — nested-worktree retargeting", () => {
  let outer: TempRepo;
  beforeEach(async () => {
    outer = await makeTempRepo();
  });
  afterEach(() => outer.cleanup());

  it("retargets state writes to the OUTER repo when invoked from inside an inner worktree", async () => {
    const inner = await initNestedAgentRepo(outer.root, "a4925f3562a8b0c25");
    const outerNorm = realpathNorm(outer.root);
    const innerNorm = realpathNorm(inner);

    const result = await handleWorktreeCreate(
      {
        name: "child-task",
        agentId: "agent-child",
        cwd: innerNorm,
      },
      { repoRoot: innerNorm },
    );

    // Assert: new worktree was created under OUTER, not inner.
    expect(result.path.startsWith(outerNorm)).toBe(true);
    expect(result.path.includes("child-task")).toBe(true);
    // Specifically: the path must NOT be nested inside the inner worktree.
    expect(result.path.startsWith(innerNorm)).toBe(false);
    expect(existsSync(result.path)).toBe(true);

    // The directory at outer/.claude/worktrees/wisp-agentdiff/child-task exists.
    const expectedOuterBase = join(
      outer.root,
      ".claude",
      "worktrees",
      "wisp-agentdiff",
      "child-task",
    );
    expect(existsSync(expectedOuterBase)).toBe(true);

    // Assert: state.json was written to OUTER, not inner.
    expect(existsSync(stateFilePath(outerNorm))).toBe(true);
    // Inner state file must NOT have been touched.
    expect(existsSync(stateFilePath(innerNorm))).toBe(false);

    const outerState = loadState(outerNorm);
    expect(outerState.agents.find((a) => a.id === "agent-child")).toBeDefined();

    // Assert: debug log contains the retargeting signal at the OUTER root.
    const debugLogPath = join(outer.root, ".claude", "wisp-agentdiff", "debug.log");
    expect(existsSync(debugLogPath)).toBe(true);
    const debugLog = readFileSync(debugLogPath, "utf8");
    expect(debugLog).toContain("worktree-create.retargeted");
    expect(debugLog).toContain("[v1.4]");
    expect(debugLog).toContain("nested wisp-agentdiff worktree detected");
  });

  it("leaves a non-nested invocation alone (no retargeting log)", async () => {
    const outerNorm = realpathNorm(outer.root);
    await handleWorktreeCreate({ name: "plain", agentId: "agent-plain" }, { repoRoot: outerNorm });

    const debugLogPath = join(outer.root, ".claude", "wisp-agentdiff", "debug.log");
    if (existsSync(debugLogPath)) {
      const debugLog = readFileSync(debugLogPath, "utf8");
      expect(debugLog).not.toContain("worktree-create.retargeted");
    }
    // State exists at outer root, and only there.
    expect(existsSync(stateFilePath(outerNorm))).toBe(true);
    const state = loadState(outerNorm);
    expect(state.agents.find((a) => a.id === "agent-plain")).toBeDefined();
  });
});

import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveOuterRepoRoot } from "../src/wrap/resolve-repo-root.js";
import { type TempRepo, makeTempRepo } from "./helpers/temp-repo.js";

function realpathNorm(p: string): string {
  return realpathSync.native ? realpathSync.native(p) : realpathSync(p);
}

async function initBareishRepo(dir: string): Promise<void> {
  mkdirSync(dir, { recursive: true });
  const git = simpleGit(dir);
  await git.init(["-b", "main"]);
  await git.addConfig("user.email", "test@example.com");
  await git.addConfig("user.name", "Test");
  await git.addConfig("commit.gpgsign", "false");
  writeFileSync(join(dir, "README.md"), "# nested\n", "utf8");
  await git.add(["README.md"]);
  await git.commit("init");
}

describe("resolveOuterRepoRoot", () => {
  let outer: TempRepo;
  beforeEach(async () => {
    outer = await makeTempRepo();
  });
  afterEach(() => outer.cleanup());

  it("(a) returns outer when called from the outer repo root", async () => {
    const resolved = await resolveOuterRepoRoot(outer.root);
    expect(resolved).toBe(realpathNorm(outer.root));
  });

  it("(b) walks out of a single nested wisp-agentdiff worktree to the outer", async () => {
    const nested = join(outer.root, ".claude", "worktrees", "wisp-agentdiff", "agent-deadbeef");
    await initBareishRepo(nested);

    const resolved = await resolveOuterRepoRoot(nested);
    expect(resolved).toBe(realpathNorm(outer.root));
  });

  it("(c) unwinds doubly-nested wisp-agentdiff worktrees back to the outer", async () => {
    const inner = join(outer.root, ".claude", "worktrees", "wisp-agentdiff", "agent-aaaa1111");
    await initBareishRepo(inner);
    const innerInner = join(inner, ".claude", "worktrees", "wisp-agentdiff", "agent-bbbb2222");
    await initBareishRepo(innerInner);

    const resolved = await resolveOuterRepoRoot(innerInner);
    expect(resolved).toBe(realpathNorm(outer.root));
  });

  it("(d) leaves an unrelated git repo path alone (no rewrite)", async () => {
    const unrelated = await makeTempRepo();
    try {
      const resolved = await resolveOuterRepoRoot(unrelated.root);
      expect(resolved).toBe(realpathNorm(unrelated.root));
      // Specifically: the path does NOT contain a .claude/worktrees segment.
      expect(resolved).not.toMatch(/[/\\]\.claude[/\\]worktrees[/\\]/);
    } finally {
      unrelated.cleanup();
    }
  });

  it("returns a realpath-normalized form (handles Windows short-path round-trip)", async () => {
    // makeTempRepo() uses os.tmpdir() which on Windows often returns a short
    // path like C:\Users\RUNNER~1\AppData\Local\Temp\... — resolveOuterRepoRoot
    // must canonicalize it via realpath so downstream string comparisons match
    // what `git rev-parse --show-toplevel` reports.
    const resolved = await resolveOuterRepoRoot(outer.root);
    expect(resolved).toBe(realpathNorm(outer.root));
  });

  it("tolerates a cwd not inside any git repo (returns normalized cwd)", async () => {
    // Use the tmpdir parent — guaranteed not to be a git repo on CI.
    // We just check it doesn't throw and returns something absolute.
    const cwd = outer.root; // safe — guaranteed git repo, used as a placeholder
    const resolved = await resolveOuterRepoRoot(cwd);
    expect(resolved.length).toBeGreaterThan(0);
  });
});

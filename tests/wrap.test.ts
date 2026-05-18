import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleWorktreeRemove } from "../src/wrap/post-spawn-hook.js";
import { handleWorktreeCreate } from "../src/wrap/pre-spawn-hook.js";
import { loadState, stateFilePath } from "../src/wrap/state.js";
import { WorktreeManager, assertValidRef, sanitizeName } from "../src/wrap/worktree-manager.js";
import { type TempRepo, makeTempRepo } from "./helpers/temp-repo.js";

describe("WorktreeManager", () => {
  let repo: TempRepo;
  beforeEach(async () => {
    repo = await makeTempRepo();
  });
  afterEach(() => repo.cleanup());

  it("creates a worktree on a fresh branch off HEAD", async () => {
    const mgr = new WorktreeManager(repo.root);
    const created = await mgr.create({ name: "alpha" });
    expect(created.name).toBe("alpha");
    expect(created.branch).toBe("wisp-agentdiff/agent-alpha");
    expect(existsSync(created.path)).toBe(true);

    const list = await mgr.list();
    expect(list.some((e) => e.path === created.path)).toBe(true);
  });

  it("captures diff against base after committing pending edits", async () => {
    const mgr = new WorktreeManager(repo.root);
    const created = await mgr.create({ name: "beta" });

    writeFileSync(join(created.path, "feature.txt"), "hello from beta\n", "utf8");
    const commitSha = await mgr.commitPending(created.path, "test edit");
    expect(commitSha).toBeTruthy();

    const diff = await mgr.diffAgainst(created.branch, created.baseRef);
    expect(diff).toContain("feature.txt");
    expect(diff).toContain("+hello from beta");
  });

  it("removes a worktree cleanly", async () => {
    const mgr = new WorktreeManager(repo.root);
    const created = await mgr.create({ name: "gamma" });
    await mgr.remove(created.path, { force: true });
    expect(existsSync(created.path)).toBe(false);
    const list = await mgr.list();
    expect(list.some((e) => e.path === created.path)).toBe(false);
  });
});

describe("sanitizeName", () => {
  it("strips unsafe characters", () => {
    expect(sanitizeName("hello world!")).toBe("hello-world");
    expect(sanitizeName("agent/01")).toBe("agent-01");
  });
  it("rejects empty slugs", () => {
    expect(() => sanitizeName("///")).toThrow();
  });
  it("rejects path-traversal and reserved names", () => {
    // ".." / "." strip down to an empty slug (after leading-dot trim) → rejected
    expect(() => sanitizeName("..")).toThrow(/empty slug|reserved|traversal/);
    expect(() => sanitizeName(".")).toThrow();
    // "../escape" normalises to "escape" — safe, no slashes survive
    expect(sanitizeName("../escape")).toBe("escape");
    // Leading dot is stripped, so ".hidden" → "hidden"
    expect(sanitizeName(".hidden")).toBe("hidden");
    expect(() => sanitizeName("HEAD")).toThrow(/reserved/);
  });
});

describe("assertValidRef", () => {
  it("accepts ordinary refs", () => {
    expect(() => assertValidRef("main")).not.toThrow();
    expect(() => assertValidRef("HEAD")).not.toThrow();
    expect(() => assertValidRef("feature/x.y-z")).not.toThrow();
    expect(() => assertValidRef("a".repeat(200))).not.toThrow();
  });
  it("rejects flags, spaces, and over-long refs", () => {
    expect(() => assertValidRef("--detach")).toThrow();
    expect(() => assertValidRef("-B")).toThrow();
    expect(() => assertValidRef("foo bar")).toThrow();
    expect(() => assertValidRef("a".repeat(201))).toThrow();
    expect(() => assertValidRef("")).toThrow();
  });
});

describe("pre/post-spawn hook integration", () => {
  let repo: TempRepo;
  beforeEach(async () => {
    repo = await makeTempRepo();
  });
  afterEach(() => repo.cleanup());

  it("records the agent on create and captures diff on remove", async () => {
    const fixedNow = new Date("2026-05-18T19:30:00Z");
    const created = await handleWorktreeCreate(
      { name: "refactor-auth", agentId: "agent-1" },
      { repoRoot: repo.root, now: () => fixedNow },
    );
    expect(created.agentId).toBe("agent-1");
    expect(existsSync(created.path)).toBe(true);

    writeFileSync(join(created.path, "auth.ts"), "export const x = 1;\n", "utf8");

    let state = loadState(repo.root);
    expect(state.agents).toHaveLength(1);
    expect(state.agents[0]?.status).toBe("running");

    const removed = await handleWorktreeRemove(
      { name: "refactor-auth", agentId: "agent-1" },
      { repoRoot: repo.root, now: () => fixedNow },
    );
    expect(removed.removed).toBe(true);
    expect(removed.filesChanged).toBeGreaterThan(0);
    expect(existsSync(removed.diffPath)).toBe(true);

    const stored = JSON.parse(readFileSync(removed.diffPath, "utf8")) as { unified: string };
    expect(stored.unified).toContain("auth.ts");

    state = loadState(repo.root);
    expect(state.agents[0]?.status).toBe("removed");
    expect(state.agents[0]?.diffPath).toBe(removed.diffPath);
    expect(existsSync(stateFilePath(repo.root))).toBe(true);
  });

  it("supports keep=true to leave the worktree on disk", async () => {
    const created = await handleWorktreeCreate(
      { name: "keep-me", agentId: "agent-keep" },
      { repoRoot: repo.root },
    );
    writeFileSync(join(created.path, "kept.txt"), "stays\n", "utf8");

    const result = await handleWorktreeRemove(
      { name: "keep-me", agentId: "agent-keep", keep: true },
      { repoRoot: repo.root },
    );
    expect(result.removed).toBe(false);
    expect(existsSync(created.path)).toBe(true);

    const state = loadState(repo.root);
    expect(state.agents[0]?.status).toBe("captured");
  });
});

import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runPrune } from "../src/prune.js";
import { type AgentRecord, loadState, saveState } from "../src/wrap/state.js";
import { WorktreeManager, defaultBasePath } from "../src/wrap/worktree-manager.js";
import { type TempRepo, makeTempRepo } from "./helpers/temp-repo.js";

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}

function seedAgent(repoRoot: string, record: AgentRecord): void {
  const state = loadState(repoRoot);
  saveState(repoRoot, { ...state, agents: [...state.agents, record] });
}

describe("runPrune", () => {
  let repo: TempRepo;
  beforeEach(async () => {
    repo = await makeTempRepo();
  });
  afterEach(() => repo.cleanup());

  it("removes a state-orphan (state entry whose path no longer exists)", async () => {
    seedAgent(repo.root, {
      id: "ghost-1",
      name: "ghost",
      path: join(defaultBasePath(repo.root), "ghost"),
      branch: "wisp-agentdiff/agent-ghost",
      baseRef: "HEAD",
      createdAt: new Date().toISOString(),
      status: "running",
    });

    const result = await runPrune({ repoRoot: repo.root });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.kind).toBe("state-orphan");
    expect(result.pruned).toHaveLength(1);
    expect(result.errors).toHaveLength(0);

    const state = loadState(repo.root);
    expect(state.agents.find((a) => a.id === "ghost-1")).toBeUndefined();
  });

  it("removes an fs-orphan (worktree on disk not in state)", async () => {
    const mgr = new WorktreeManager(repo.root);
    const created = await mgr.create({ name: "rogue" });
    expect(existsSync(created.path)).toBe(true);

    // Deliberately do NOT register in state.
    const result = await runPrune({ repoRoot: repo.root });
    const fsOrphans = result.candidates.filter((c) => c.kind === "fs-orphan");
    expect(fsOrphans).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    expect(result.pruned.some((p) => p.kind === "fs-orphan")).toBe(true);
    expect(existsSync(created.path)).toBe(false);
  });

  it("prunes an aged-out agent (createdAt > 7 days, worktree exists)", async () => {
    const mgr = new WorktreeManager(repo.root);
    const created = await mgr.create({ name: "ancient" });
    seedAgent(repo.root, {
      id: "ancient-1",
      name: created.name,
      path: created.path,
      branch: created.branch,
      baseRef: created.baseRef,
      createdAt: hoursAgo(24 * 8),
      status: "completed",
    });

    const result = await runPrune({ repoRoot: repo.root });
    const agedOut = result.candidates.filter((c) => c.kind === "aged-out");
    expect(agedOut).toHaveLength(1);
    expect(result.pruned.some((p) => p.kind === "aged-out")).toBe(true);
    expect(existsSync(created.path)).toBe(false);
    expect(loadState(repo.root).agents.find((a) => a.id === "ancient-1")).toBeUndefined();
  });

  it("keeps a recent agent untouched (createdAt now, default cutoff)", async () => {
    const mgr = new WorktreeManager(repo.root);
    const created = await mgr.create({ name: "fresh" });
    writeFileSync(join(created.path, "marker.txt"), "still here\n", "utf8");
    seedAgent(repo.root, {
      id: "fresh-1",
      name: created.name,
      path: created.path,
      branch: created.branch,
      baseRef: created.baseRef,
      createdAt: new Date().toISOString(),
      status: "running",
    });

    const result = await runPrune({ repoRoot: repo.root });
    expect(result.candidates).toHaveLength(0);
    expect(result.pruned).toHaveLength(0);
    expect(existsSync(created.path)).toBe(true);
    expect(loadState(repo.root).agents.find((a) => a.id === "fresh-1")).toBeDefined();
  });

  it("dry-run does not mutate filesystem or state", async () => {
    const mgr = new WorktreeManager(repo.root);
    const created = await mgr.create({ name: "dryrun" });
    seedAgent(repo.root, {
      id: "dryrun-1",
      name: created.name,
      path: created.path,
      branch: created.branch,
      baseRef: created.baseRef,
      createdAt: hoursAgo(24 * 8),
      status: "completed",
    });

    const result = await runPrune({ repoRoot: repo.root, dryRun: true });
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.pruned).toHaveLength(0);
    expect(result.skipped).toHaveLength(result.candidates.length);

    expect(existsSync(created.path)).toBe(true);
    expect(loadState(repo.root).agents.find((a) => a.id === "dryrun-1")).toBeDefined();
  });
});

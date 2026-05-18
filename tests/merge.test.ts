import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "../src/collect/diff-parser.js";
import { emptySummary } from "../src/collect/jsonl-reader.js";
import type { AgentReport } from "../src/collect/token-tracker.js";
import { applyApproved } from "../src/merge/approver.js";
import { handleWorktreeRemove } from "../src/wrap/post-spawn-hook.js";
import { handleWorktreeCreate } from "../src/wrap/pre-spawn-hook.js";
import { loadState } from "../src/wrap/state.js";
import { type TempRepo, makeTempRepo } from "./helpers/temp-repo.js";

describe("applyApproved (synthetic conflict gating)", () => {
  it("returns blockedConflicts and does not call git when approved agents collide", async () => {
    const colliding: AgentReport[] = [synth("alpha", "src/auth.ts"), synth("beta", "src/auth.ts")];
    const result = await applyApproved(colliding, new Set(["id-alpha", "id-beta"]), {
      repoRoot: "/nope-this-is-not-touched",
      dryRun: false,
    });
    expect(result.attempted).toBe(false);
    expect(result.blockedConflicts.map((c) => c.path)).toEqual(["src/auth.ts"]);
    expect(result.merged).toHaveLength(0);
  });

  it("dry-run reports each approved agent as 'dry-run' without touching the repo", async () => {
    const reports: AgentReport[] = [synth("alpha", "a.ts"), synth("beta", "b.ts")];
    const result = await applyApproved(reports, new Set(["id-alpha", "id-beta"]), {
      repoRoot: "/nope",
      dryRun: true,
    });
    expect(result.attempted).toBe(false);
    expect(result.merged.every((o) => o.status === "dry-run")).toBe(true);
    expect(result.merged.map((o) => o.agentName).sort()).toEqual(["alpha", "beta"]);
  });
});

describe("applyApproved end-to-end against a real worktree", () => {
  let repo: TempRepo;
  beforeEach(async () => {
    repo = await makeTempRepo();
  });
  afterEach(() => repo.cleanup());

  it("merges an approved agent branch into HEAD on the main worktree", async () => {
    const wtA = await handleWorktreeCreate(
      { name: "alpha", agentId: "id-alpha" },
      { repoRoot: repo.root },
    );
    writeFileSync(join(wtA.path, "alpha.ts"), "export const a = 1;\n", "utf8");
    const remA = await handleWorktreeRemove(
      { name: "alpha", agentId: "id-alpha", keep: false },
      { repoRoot: repo.root },
    );
    expect(remA.filesChanged).toBeGreaterThan(0);

    const state = loadState(repo.root);
    const persistedAgent = state.agents[0];
    if (!persistedAgent) throw new Error("expected one agent in state");
    const report: AgentReport = {
      agent: persistedAgent,
      diff: parseUnifiedDiff(
        "diff --git a/alpha.ts b/alpha.ts\nnew file mode 100644\nindex 0..1\n--- /dev/null\n+++ b/alpha.ts\n@@ -0,0 +1,1 @@\n+export const a = 1;\n",
      ),
      transcript: emptySummary(),
      rawDiff: "",
    };

    const result = await applyApproved([report], new Set(["id-alpha"]), {
      repoRoot: repo.root,
      deleteBranches: true,
    });
    expect(result.attempted).toBe(true);
    expect(result.merged).toHaveLength(1);
    expect(result.merged[0]?.status).toBe("merged");

    // After a --no-ff merge the latest commit is the merge commit; the
    // captured subagent commit lives one step back. Search both via raw log.
    const rawLog = await repo.git.raw(["log", "--all", "--pretty=%s", "-n", "5"]);
    expect(rawLog).toContain("capture subagent edits");
    expect(rawLog).toContain("Merge branch 'wisp-agentdiff/agent-alpha'");

    const branches = await repo.git.branch();
    expect(branches.all.includes("wisp-agentdiff/agent-alpha")).toBe(false);
    expect(await repo.git.raw(["ls-files", "alpha.ts"])).toContain("alpha.ts");
  });
});

function synth(name: string, path: string): AgentReport {
  return {
    agent: {
      id: `id-${name}`,
      name,
      path: "/",
      branch: `wisp-agentdiff/agent-${name}`,
      baseRef: "HEAD",
      createdAt: "",
      status: "captured",
    },
    diff: {
      files: [{ path, kind: "modified", additions: 1, deletions: 0, hunks: [], binary: false }],
      totals: { files: 1, additions: 1, deletions: 0 },
    },
    transcript: emptySummary(),
    rawDiff: "",
  };
}

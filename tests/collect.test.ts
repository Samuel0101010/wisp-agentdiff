import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseNameStatus, parseUnifiedDiff } from "../src/collect/diff-parser.js";
import {
  digestEvent,
  emptySummary,
  readTranscript,
  summarizeJsonlText,
} from "../src/collect/jsonl-reader.js";
import { aggregateTotals, buildAgentReport } from "../src/collect/token-tracker.js";

const FIXTURES = join(__dirname, "fixtures");

describe("parseUnifiedDiff", () => {
  it("classifies added/deleted/modified files with correct line counts", () => {
    const text = readFileSync(join(FIXTURES, "sample.diff"), "utf8");
    const parsed = parseUnifiedDiff(text);

    expect(parsed.files).toHaveLength(3);
    expect(parsed.totals).toEqual({ files: 3, additions: 2 + 2, deletions: 3 });

    const auth = parsed.files.find((f) => f.path === "src/auth.ts");
    expect(auth?.kind).toBe("modified");
    expect(auth?.additions).toBe(2);
    expect(auth?.deletions).toBe(0);
    expect(auth?.hunks).toHaveLength(1);

    const legacy = parsed.files.find((f) => f.path === "src/legacy.ts");
    expect(legacy?.kind).toBe("deleted");
    expect(legacy?.deletions).toBe(3);

    const fresh = parsed.files.find((f) => f.path === "src/new.ts");
    expect(fresh?.kind).toBe("added");
    expect(fresh?.additions).toBe(2);
  });

  it("returns empty totals for empty input", () => {
    const parsed = parseUnifiedDiff("");
    expect(parsed.files).toHaveLength(0);
    expect(parsed.totals.additions).toBe(0);
  });
});

describe("parseNameStatus", () => {
  it("maps single-letter codes to kinds", () => {
    const map = parseNameStatus("A\tsrc/a.ts\nM\tsrc/b.ts\nD\tsrc/c.ts\nR090\told\tnew\n");
    expect(map.get("src/a.ts")).toBe("added");
    expect(map.get("src/b.ts")).toBe("modified");
    expect(map.get("src/c.ts")).toBe("deleted");
    expect(map.get("new")).toBe("renamed");
  });
});

describe("jsonl-reader", () => {
  it("aggregates tokens and tool-uses from sample transcript", async () => {
    const summary = await readTranscript(join(FIXTURES, "sample-transcript.jsonl"));
    expect(summary.messageCount).toBe(5);
    expect(summary.inputTokens).toBe(1200 + 1500 + 2000);
    expect(summary.outputTokens).toBe(80 + 120 + 300 + 40);
    expect(summary.cacheReadTokens).toBe(4500);
    expect(summary.cacheWriteTokens).toBe(150);
    expect(summary.totalToolCalls).toBe(4);
    expect(summary.toolUses.get("Read")).toBe(2);
    expect(summary.toolUses.get("Grep")).toBe(1);
    expect(summary.toolUses.get("Edit")).toBe(1);
    expect(summary.durationMs).toBe(12500);
    expect(summary.model).toBe("claude-opus-4-7");
    expect(summary.result).toBe("Refactor complete.");
  });

  it("returns empty summary for missing file", async () => {
    const summary = await readTranscript("/nonexistent/transcript.jsonl");
    expect(summary.messageCount).toBe(0);
  });

  it("digestEvent tolerates flat tool_uses arrays of strings", () => {
    const into = emptySummary();
    digestEvent({ tool_uses: ["Bash", "Read"], usage: { total_tokens: 50 } }, into);
    expect(into.toolUses.get("Bash")).toBe(1);
    expect(into.toolUses.get("Read")).toBe(1);
    expect(into.totalTokens).toBe(50);
  });

  it("summarizeJsonlText skips malformed lines without throwing", () => {
    const text = '{"usage":{"input_tokens":10}}\nNOT JSON\n{"usage":{"input_tokens":5}}\n';
    const s = summarizeJsonlText(text);
    expect(s.inputTokens).toBe(15);
    expect(s.messageCount).toBe(2);
  });
});

describe("aggregateTotals", () => {
  it("sums across reports", () => {
    const totals = aggregateTotals([
      {
        agent: {
          id: "a",
          name: "a",
          path: "/",
          branch: "x",
          baseRef: "y",
          createdAt: "",
          status: "captured",
        },
        rawDiff: "",
        diff: { files: [], totals: { files: 2, additions: 10, deletions: 5 } },
        transcript: { ...emptySummary(), totalTokens: 100, totalToolCalls: 7 },
      },
      {
        agent: {
          id: "b",
          name: "b",
          path: "/",
          branch: "x",
          baseRef: "y",
          createdAt: "",
          status: "captured",
        },
        rawDiff: "",
        diff: { files: [], totals: { files: 1, additions: 3, deletions: 1 } },
        transcript: { ...emptySummary(), totalTokens: 50, totalToolCalls: 2 },
      },
    ]);
    expect(totals).toEqual({
      agents: 2,
      files: 3,
      additions: 13,
      deletions: 6,
      totalTokens: 150,
      totalToolCalls: 9,
    });
  });
});

describe("buildAgentReport", () => {
  it("returns empty diff and source=missing when path doesn't exist", async () => {
    const report = await buildAgentReport({
      id: "x",
      name: "x",
      path: "C:/nonexistent-wisp-test-path-xyzzy",
      branch: "b",
      baseRef: "r",
      createdAt: "",
      status: "running",
    });
    expect(report.diff.files).toHaveLength(0);
    expect(report.transcript.messageCount).toBe(0);
    expect(report.diffSource).toBe("missing");
  });

  it("falls back to live worktree diff when no stored diff exists", async () => {
    // Integration-flavoured test: temp git repo + real worktree, no diff cache.
    const { makeTempRepo } = await import("./helpers/temp-repo.js");
    const { WorktreeManager } = await import("../src/wrap/worktree-manager.js");
    const { writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");

    const repo = await makeTempRepo();
    try {
      const mgr = new WorktreeManager(repo.root);
      const created = await mgr.create({ name: "live-diff" });
      writeFileSync(join(created.path, "live.ts"), "export const live = true;\n", "utf8");
      // Note: no commit — this verifies the working-tree-included git diff path.
      await mgr.commitPending(created.path, "test commit for live-diff");

      const report = await buildAgentReport({
        id: "live-1",
        name: created.name,
        path: created.path,
        branch: created.branch,
        baseRef: created.baseRef,
        createdAt: "",
        status: "running",
        // no diffPath — forces the live fallback
      });
      expect(report.diffSource).toBe("live");
      expect(report.rawDiff).toContain("live.ts");
      expect(report.rawDiff).toContain("+export const live = true;");
    } finally {
      repo.cleanup();
    }
  });
});

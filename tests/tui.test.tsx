import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "../src/collect/diff-parser.js";
import { emptySummary } from "../src/collect/jsonl-reader.js";
import type { AgentReport } from "../src/collect/token-tracker.js";
import { App } from "../src/tui/app.js";
import { initialState, mapKey, reduce } from "../src/tui/hotkeys.js";
import type { AgentView } from "../src/tui/session.js";

function makeView(name: string, diffText = "", displayLabel?: string): AgentView {
  const report: AgentReport = {
    agent: {
      id: `id-${name}`,
      name,
      ...(displayLabel !== undefined ? { displayLabel } : {}),
      path: `/${name}`,
      branch: `wisp-agentdiff/agent-${name}`,
      baseRef: "HEAD",
      createdAt: "2026-05-18T00:00:00Z",
      status: "captured",
    },
    diff: parseUnifiedDiff(diffText),
    transcript: { ...emptySummary(), totalTokens: 100, totalToolCalls: 3 },
    rawDiff: diffText,
  };
  return { report, decision: "pending" };
}

describe("hotkey reducer", () => {
  it("approve auto-advances and records decision", () => {
    const s0 = initialState(3);
    const s1 = reduce(s0, mapKey({ input: "a", key: {} }));
    expect(s1.decisions[0]).toBe("approved");
    expect(s1.activeIndex).toBe(1);
  });

  it("revert auto-advances and records decision", () => {
    const s0 = initialState(2);
    const s1 = reduce(s0, mapKey({ input: "r", key: {} }));
    expect(s1.decisions[0]).toBe("reverted");
    expect(s1.activeIndex).toBe(1);
  });

  it("next wraps around at end", () => {
    const s0 = { ...initialState(2), activeIndex: 1 };
    const s1 = reduce(s0, mapKey({ input: "n", key: {} }));
    expect(s1.activeIndex).toBe(0);
  });

  it("prev wraps around at start", () => {
    const s0 = initialState(2);
    const s1 = reduce(s0, mapKey({ input: "", key: { leftArrow: true } }));
    expect(s1.activeIndex).toBe(1);
  });

  it("toggle-conflict flips mode", () => {
    const s0 = initialState(1);
    expect(s0.mode).toBe("diff");
    const s1 = reduce(s0, mapKey({ input: "c", key: {} }));
    expect(s1.mode).toBe("conflict");
    const s2 = reduce(s1, mapKey({ input: "c", key: {} }));
    expect(s2.mode).toBe("diff");
  });

  it("scroll clamps at zero", () => {
    const s0 = initialState(1);
    const s1 = reduce(s0, mapKey({ input: "k", key: {} }));
    expect(s1.scroll).toBe(0);
    const s2 = reduce(s1, mapKey({ input: "j", key: {} }));
    expect(s2.scroll).toBe(1);
  });

  it("quit sets shouldExit", () => {
    const s = reduce(initialState(1), mapKey({ input: "q", key: {} }));
    expect(s.shouldExit).toBe(true);
  });

  it("handles zero agents gracefully", () => {
    const s = initialState(0);
    const next = reduce(s, mapKey({ input: "n", key: {} }));
    expect(next.activeIndex).toBe(0);
  });
});

describe("App render", () => {
  it("shows empty-state copy when no agents are recorded", () => {
    const { lastFrame, unmount } = render(<App agents={[]} />);
    expect(lastFrame()).toContain("no subagents");
    unmount();
  });

  it("tab bar prefers displayLabel over name when present", () => {
    const views = [makeView("zzraw01", "", "wisp-self-test"), makeView("beta")];
    const { lastFrame, unmount } = render(<App agents={views} />);
    const frame = lastFrame() ?? "";
    // Tab bar is the first rounded-border block; isolate it so the branch line
    // (which always contains `name`) doesn't pollute the assertion.
    const tabBar = frame.split("\n").slice(0, 3).join("\n");
    expect(tabBar).toContain("wisp-self-test");
    expect(tabBar).not.toContain("zzraw01");
    expect(tabBar).toContain("beta");
    unmount();
  });

  it("renders agent tabs and the diff summary", () => {
    const diff =
      "diff --git a/x.ts b/x.ts\nindex aaa..bbb 100644\n--- a/x.ts\n+++ b/x.ts\n@@ -1,1 +1,2 @@\n const a=1;\n+const b=2;\n";
    const views = [makeView("alpha", diff), makeView("beta")];
    const { lastFrame, unmount } = render(<App agents={views} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("alpha");
    expect(frame).toContain("beta");
    expect(frame).toContain("[a]pprove");
    expect(frame).toContain("+ const b=2;");
    unmount();
  });
});

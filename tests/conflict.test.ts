import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "../src/collect/diff-parser.js";
import { emptySummary } from "../src/collect/jsonl-reader.js";
import type { AgentReport } from "../src/collect/token-tracker.js";
import { approvedConflicts, detectConflicts } from "../src/merge/conflict-detector.js";

function makeReport(name: string, diffText: string): AgentReport {
  return {
    agent: {
      id: `id-${name}`,
      name,
      path: `/${name}`,
      branch: `wisp-agentdiff/agent-${name}`,
      baseRef: "HEAD",
      createdAt: "",
      status: "captured",
    },
    diff: parseUnifiedDiff(diffText),
    transcript: emptySummary(),
    rawDiff: diffText,
  };
}

const diffOnAuth = `diff --git a/src/auth.ts b/src/auth.ts
index aaa..bbb 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,1 +1,2 @@
 export const x = 1;
+export const y = 2;
`;

const diffOnBoth = `diff --git a/src/auth.ts b/src/auth.ts
index aaa..ccc 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,1 +1,2 @@
 export const x = 1;
+export const z = 3;
diff --git a/src/util.ts b/src/util.ts
new file mode 100644
index 0000000..ddd
--- /dev/null
+++ b/src/util.ts
@@ -0,0 +1,1 @@
+export const u = 4;
`;

const diffOnUtil = `diff --git a/src/util.ts b/src/util.ts
index ddd..eee 100644
--- a/src/util.ts
+++ b/src/util.ts
@@ -1,1 +1,2 @@
 export const u = 4;
+export const v = 5;
`;

describe("detectConflicts", () => {
  it("returns empty when no two agents touch the same file", () => {
    const reports = [
      makeReport("alpha", diffOnAuth),
      makeReport(
        "beta",
        `diff --git a/src/login.ts b/src/login.ts
new file mode 100644
index 0..1
--- /dev/null
+++ b/src/login.ts
@@ -0,0 +1,1 @@
+export const login = true;
`,
      ),
    ];
    expect(detectConflicts(reports)).toHaveLength(0);
  });

  it("finds files touched by 2+ agents", () => {
    const reports = [
      makeReport("alpha", diffOnAuth),
      makeReport("beta", diffOnBoth),
      makeReport("gamma", diffOnUtil),
    ];
    const conflicts = detectConflicts(reports);
    expect(conflicts.map((c) => c.path).sort()).toEqual(["src/auth.ts", "src/util.ts"]);

    const auth = conflicts.find((c) => c.path === "src/auth.ts");
    expect(auth?.participants.map((p) => p.agentName).sort()).toEqual(["alpha", "beta"]);

    const util = conflicts.find((c) => c.path === "src/util.ts");
    expect(util?.participants).toHaveLength(2);
    expect(util?.participants.every((p) => p.additions >= 1)).toBe(true);
  });
});

describe("approvedConflicts", () => {
  it("only reports conflicts among approved agents", () => {
    const reports = [
      makeReport("alpha", diffOnAuth),
      makeReport("beta", diffOnBoth),
      makeReport("gamma", diffOnUtil),
    ];
    const conflicts = detectConflicts(reports);
    const approved = approvedConflicts(conflicts, new Set(["id-alpha", "id-gamma"]));
    // alpha & gamma touch different files → no conflict among approved
    expect(approved).toHaveLength(0);

    const approvedAll = approvedConflicts(conflicts, new Set(["id-alpha", "id-beta", "id-gamma"]));
    expect(approvedAll.map((c) => c.path).sort()).toEqual(["src/auth.ts", "src/util.ts"]);
  });
});

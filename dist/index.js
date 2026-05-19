#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/wrap/state.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
function stateFilePath(repoRoot) {
  return resolve(repoRoot, STATE_FILE);
}
function freshState(repoRoot) {
  return {
    version: 1,
    sessionStartedAt: (/* @__PURE__ */ new Date()).toISOString(),
    repoRoot,
    agents: []
  };
}
function loadState(repoRoot) {
  const file = stateFilePath(repoRoot);
  if (!existsSync(file)) return freshState(repoRoot);
  const raw = readFileSync(file, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return freshState(repoRoot);
  }
  if (!isValidState(parsed)) return freshState(repoRoot);
  return parsed;
}
function isValidState(value) {
  if (!value || typeof value !== "object") return false;
  const v = value;
  if (v.version !== 1) return false;
  if (typeof v.repoRoot !== "string") return false;
  if (typeof v.sessionStartedAt !== "string") return false;
  if (!Array.isArray(v.agents)) return false;
  return true;
}
function saveState(repoRoot, state) {
  const file = stateFilePath(repoRoot);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
}
function upsertAgent(state, agent) {
  const idx = state.agents.findIndex((a) => a.id === agent.id);
  const next = { ...state, agents: [...state.agents] };
  if (idx >= 0) {
    next.agents[idx] = agent;
  } else {
    next.agents.push(agent);
  }
  return next;
}
function diffStoragePath(repoRoot, agentId) {
  return join(repoRoot, ".claude", "wisp-agentdiff", "diffs", `${agentId}.json`);
}
var STATE_FILE;
var init_state = __esm({
  "src/wrap/state.ts"() {
    "use strict";
    STATE_FILE = ".claude/wisp-agentdiff-state.json";
  }
});

// src/install.ts
var install_exports = {};
__export(install_exports, {
  defaultTargetDir: () => defaultTargetDir,
  installArtifacts: () => installArtifacts,
  resolvePackageRoot: () => resolvePackageRoot
});
import { copyFileSync, existsSync as existsSync3, mkdirSync as mkdirSync5, readFileSync as readFileSync2 } from "fs";
import { homedir } from "os";
import { dirname as dirname5, join as join3, resolve as resolve3 } from "path";
import { fileURLToPath } from "url";
function defaultTargetDir() {
  return process.env.CLAUDE_CONFIG_DIR ? resolve3(process.env.CLAUDE_CONFIG_DIR) : join3(homedir(), ".claude");
}
function resolvePackageRoot() {
  const thisFile = fileURLToPath(import.meta.url);
  return resolve3(dirname5(thisFile), "..");
}
function installArtifacts(options = {}) {
  const target = options.targetDir ?? defaultTargetDir();
  const pkgRoot = options.packageRoot ?? resolvePackageRoot();
  const skillSrc = join3(pkgRoot, "skills", "wisp-agentdiff", "SKILL.md");
  const cmdSrc = join3(pkgRoot, "commands", "review-agents.md");
  const hookSrc = join3(pkgRoot, "templates", "hooks-snippet.json");
  for (const p of [skillSrc, cmdSrc, hookSrc]) {
    if (!existsSync3(p)) {
      throw new Error(`required artifact not found at ${p} \u2014 reinstall wisp-agentdiff`);
    }
  }
  const skillDst = join3(target, "skills", "wisp-agentdiff", "SKILL.md");
  mkdirSync5(dirname5(skillDst), { recursive: true });
  copyFileSync(skillSrc, skillDst);
  const cmdDst = join3(target, "commands", "review-agents.md");
  mkdirSync5(dirname5(cmdDst), { recursive: true });
  copyFileSync(cmdSrc, cmdDst);
  if (options.printHookSnippet !== false) {
    const snippet = readFileSync2(hookSrc, "utf8");
    process.stdout.write("\n");
    process.stdout.write(`\u2713 Installed skill   \u2192 ${skillDst}
`);
    process.stdout.write(`\u2713 Installed command \u2192 ${cmdDst}
`);
    process.stdout.write("\n");
    process.stdout.write("Next step \u2014 wire the native Claude Code worktree hooks.\n");
    process.stdout.write(`Add this block to ${join3(target, "settings.json")}:

`);
    process.stdout.write(snippet);
    process.stdout.write("\n");
    process.stdout.write("Tip: if you'd rather Claude Code wire the hooks itself, run\n");
    process.stdout.write("  /plugin install Samuel0101010/wisp-agentdiff\n");
    process.stdout.write("inside any Claude Code session \u2014 that path skips this manual step.\n");
  }
  return { skillPath: skillDst, commandPath: cmdDst, hookSnippetPath: hookSrc };
}
var init_install = __esm({
  "src/install.ts"() {
    "use strict";
  }
});

// src/merge/conflict-detector.ts
function detectConflicts(reports) {
  const byPath = /* @__PURE__ */ new Map();
  for (const report of reports) {
    for (const file of report.diff.files) {
      const list = byPath.get(file.path) ?? [];
      list.push(buildParticipant(report, file));
      byPath.set(file.path, list);
    }
  }
  const conflicts = [];
  for (const [path, participants] of byPath) {
    if (participants.length >= 2) {
      conflicts.push({ path, participants });
    }
  }
  conflicts.sort((a, b) => a.path.localeCompare(b.path));
  return conflicts;
}
function buildParticipant(report, file) {
  return {
    agentId: report.agent.id,
    agentName: report.agent.name,
    branch: report.agent.branch,
    kind: file.kind,
    additions: file.additions,
    deletions: file.deletions,
    ...file.hunks[0]?.header ? { firstHunk: file.hunks[0].header } : {}
  };
}
function approvedConflicts(conflicts, approvedIds) {
  return conflicts.map((c) => ({
    path: c.path,
    participants: c.participants.filter((p) => approvedIds.has(p.agentId))
  })).filter((c) => c.participants.length >= 2);
}
var init_conflict_detector = __esm({
  "src/merge/conflict-detector.ts"() {
    "use strict";
  }
});

// src/merge/approver.ts
import { simpleGit as simpleGit2 } from "simple-git";
async function applyApproved(reports, approvedIds, options) {
  const conflicts = detectConflicts(reports);
  const blocked = approvedConflicts(conflicts, approvedIds);
  if (blocked.length > 0) {
    return { merged: [], blockedConflicts: blocked, attempted: false };
  }
  const approved = reports.filter((r) => approvedIds.has(r.agent.id));
  const dryRun = options.dryRun ?? false;
  const deleteBranches = options.deleteBranches ?? true;
  const strategy = options.strategy ?? "no-ff";
  const git = dryRun ? null : simpleGit2(options.repoRoot);
  const outcomes = [];
  for (const r of approved) {
    if (dryRun) {
      outcomes.push({
        agentId: r.agent.id,
        agentName: r.agent.name,
        branch: r.agent.branch,
        status: "dry-run"
      });
      continue;
    }
    const args = buildMergeArgs(strategy, r.agent.branch);
    try {
      if (!git) throw new Error("internal: git instance not initialized");
      await git.raw(args);
      if (deleteBranches) {
        try {
          await git.raw(["branch", "-D", r.agent.branch]);
        } catch (err) {
          if (process.env.WISP_DEBUG) process.stderr.write(`${String(err)}
`);
        }
      }
      outcomes.push({
        agentId: r.agent.id,
        agentName: r.agent.name,
        branch: r.agent.branch,
        status: "merged"
      });
    } catch (err) {
      try {
        await git?.raw(["merge", "--abort"]);
      } catch {
      }
      outcomes.push({
        agentId: r.agent.id,
        agentName: r.agent.name,
        branch: r.agent.branch,
        status: "failed",
        message: err instanceof Error ? err.message : String(err)
      });
      break;
    }
  }
  for (const r of approved) {
    if (outcomes.some((o) => o.agentId === r.agent.id)) continue;
    outcomes.push({
      agentId: r.agent.id,
      agentName: r.agent.name,
      branch: r.agent.branch,
      status: "skipped",
      message: "preceding merge failed"
    });
  }
  return { merged: outcomes, blockedConflicts: [], attempted: !dryRun };
}
function buildMergeArgs(strategy, branch) {
  switch (strategy) {
    case "ff-only":
      return ["merge", "--ff-only", branch];
    case "squash":
      return ["merge", "--squash", branch];
    default:
      return ["merge", "--no-ff", "--no-edit", branch];
  }
}
var init_approver = __esm({
  "src/merge/approver.ts"() {
    "use strict";
    init_conflict_detector();
  }
});

// src/tui/styles.ts
var theme, decisionGlyph, decisionColor;
var init_styles = __esm({
  "src/tui/styles.ts"() {
    "use strict";
    theme = {
      accent: "cyan",
      added: "green",
      removed: "red",
      warning: "yellow",
      muted: "gray"
    };
    decisionGlyph = {
      pending: "\xB7",
      approved: "\u2713",
      reverted: "\u2717"
    };
    decisionColor = {
      pending: theme.muted,
      approved: theme.added,
      reverted: theme.removed
    };
  }
});

// src/tui/conflict-view.tsx
import { Box, Text } from "ink";
import { jsx, jsxs } from "react/jsx-runtime";
var ConflictView;
var init_conflict_view = __esm({
  "src/tui/conflict-view.tsx"() {
    "use strict";
    init_styles();
    ConflictView = ({ conflicts, activeConflict = 0 }) => {
      if (conflicts.length === 0) {
        return /* @__PURE__ */ jsx(Box, { paddingX: 1, paddingY: 1, children: /* @__PURE__ */ jsx(Text, { color: theme.added, children: "no cross-agent file conflicts \u2014 safe to merge" }) });
      }
      const idx = Math.max(0, Math.min(activeConflict, conflicts.length - 1));
      const active = conflicts[idx];
      if (!active) return null;
      return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", paddingX: 1, children: [
        /* @__PURE__ */ jsxs(Text, { color: theme.warning, children: [
          conflicts.length,
          " conflicting file",
          conflicts.length > 1 ? "s" : "",
          " \xB7 viewing ",
          idx + 1,
          "/",
          conflicts.length
        ] }),
        /* @__PURE__ */ jsxs(Text, { color: theme.accent, children: [
          "\u2500\u2500 ",
          active.path
        ] }),
        active.participants.map((p) => /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, children: [
          /* @__PURE__ */ jsxs(Text, { color: theme.accent, children: [
            p.agentName,
            " ",
            /* @__PURE__ */ jsxs(Text, { color: theme.muted, children: [
              "(",
              p.kind,
              " \xB7 +",
              p.additions,
              " -",
              p.deletions,
              ")"
            ] })
          ] }),
          p.firstHunk ? /* @__PURE__ */ jsx(Text, { color: theme.warning, children: p.firstHunk }) : null,
          /* @__PURE__ */ jsxs(Text, { color: theme.muted, children: [
            "branch ",
            p.branch
          ] })
        ] }, p.agentId)),
        /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { color: theme.muted, children: "press [c] to return to diff view \xB7 resolve by reverting one of the conflicting agents" }) })
      ] });
    };
  }
});

// src/tui/diff-view.tsx
import { Box as Box2, Text as Text2 } from "ink";
import { useMemo } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function flattenDiff(report) {
  const rows = [];
  for (const file of report.diff.files) {
    rows.push({
      kind: "header",
      text: `\u2500\u2500 ${file.kind.padEnd(8)} ${file.path}${file.oldPath ? `  \u27F5 ${file.oldPath}` : ""}`
    });
    if (file.binary) {
      rows.push({ kind: "note", text: "  (binary file)" });
      continue;
    }
    for (const hunk of file.hunks) {
      rows.push({ kind: "hunk", text: hunk.header });
      for (const line of hunk.lines) {
        if (line.kind === "+") rows.push({ kind: "added", text: `+ ${line.text}` });
        else if (line.kind === "-") rows.push({ kind: "removed", text: `- ${line.text}` });
        else rows.push({ kind: "context", text: `  ${line.text}` });
      }
    }
  }
  return rows;
}
function rowColor(kind) {
  switch (kind) {
    case "header":
      return theme.accent;
    case "hunk":
      return theme.warning;
    case "added":
      return theme.added;
    case "removed":
      return theme.removed;
    case "note":
      return theme.muted;
    default:
      return void 0;
  }
}
var DiffView;
var init_diff_view = __esm({
  "src/tui/diff-view.tsx"() {
    "use strict";
    init_styles();
    DiffView = ({ report, scroll, viewportLines = 24 }) => {
      const flat = useMemo(() => flattenDiff(report), [report]);
      if (flat.length === 0) {
        return /* @__PURE__ */ jsx2(Box2, { paddingX: 1, children: /* @__PURE__ */ jsx2(Text2, { color: theme.muted, children: "(no changes recorded for this agent)" }) });
      }
      const start = Math.min(scroll, Math.max(0, flat.length - 1));
      const slice = flat.slice(start, start + viewportLines);
      return /* @__PURE__ */ jsxs2(Box2, { flexDirection: "column", paddingX: 1, children: [
        /* @__PURE__ */ jsxs2(Text2, { color: theme.muted, children: [
          "line ",
          start + 1,
          "\u2013",
          start + slice.length,
          " of ",
          flat.length,
          " \xB7 ",
          report.diff.totals.files,
          " files \xB7 +",
          report.diff.totals.additions,
          " -",
          report.diff.totals.deletions
        ] }),
        slice.map((row, i) => /* @__PURE__ */ jsx2(Text2, { color: rowColor(row.kind), children: row.text }, `${start}-${i}-${row.kind}`))
      ] });
    };
  }
});

// src/tui/hotkeys.ts
function mapKey(event) {
  const { input, key } = event;
  if (key.leftArrow) return { type: "prev" };
  if (key.rightArrow) return { type: "next" };
  if (key.upArrow) return { type: "scroll", delta: -1 };
  if (key.downArrow) return { type: "scroll", delta: 1 };
  switch (input) {
    case "n":
      return { type: "next" };
    case "p":
      return { type: "prev" };
    case "a":
      return { type: "approve" };
    case "r":
      return { type: "revert" };
    case "c":
      return { type: "toggle-conflict" };
    case "m":
      return { type: "merge" };
    case "j":
      return { type: "scroll", delta: 1 };
    case "k":
      return { type: "scroll", delta: -1 };
    case "q":
      return { type: "quit" };
    default:
      return { type: "noop" };
  }
}
function initialState(agentCount) {
  return {
    activeIndex: 0,
    decisions: new Array(agentCount).fill("pending"),
    scroll: 0,
    mode: "diff",
    shouldExit: false
  };
}
function reduce(state, action) {
  const total = state.decisions.length;
  switch (action.type) {
    case "next":
      if (total === 0) return state;
      return { ...state, activeIndex: (state.activeIndex + 1) % total, scroll: 0 };
    case "prev":
      if (total === 0) return state;
      return { ...state, activeIndex: (state.activeIndex - 1 + total) % total, scroll: 0 };
    case "approve":
      return setDecision(state, "approved");
    case "revert":
      return setDecision(state, "reverted");
    case "toggle-conflict":
      return { ...state, mode: state.mode === "conflict" ? "diff" : "conflict" };
    case "merge":
      return state;
    case "scroll":
      return { ...state, scroll: Math.max(0, state.scroll + action.delta) };
    case "quit":
      return { ...state, shouldExit: true };
    default:
      return state;
  }
}
function setDecision(state, decision) {
  if (state.decisions.length === 0) return state;
  const next = state.decisions.slice();
  next[state.activeIndex] = decision;
  const advanced = state.activeIndex + 1 < next.length ? state.activeIndex + 1 : state.activeIndex;
  return { ...state, decisions: next, activeIndex: advanced, scroll: 0 };
}
var init_hotkeys = __esm({
  "src/tui/hotkeys.ts"() {
    "use strict";
  }
});

// src/collect/diff-parser.ts
function parseUnifiedDiff(text) {
  const lines = text.split(/\r?\n/);
  const files = [];
  let current = null;
  let hunk = null;
  const finalizeHunk = () => {
    if (hunk && current) current.hunks.push(hunk);
    hunk = null;
  };
  const finalizeFile = () => {
    finalizeHunk();
    if (current) files.push(current);
    current = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.startsWith("diff --git ")) {
      finalizeFile();
      const m = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      const oldP = m?.[1] ?? "";
      const newP = m?.[2] ?? oldP;
      current = {
        path: newP,
        kind: "modified",
        additions: 0,
        deletions: 0,
        hunks: [],
        binary: false,
        ...oldP !== newP ? { oldPath: oldP } : {}
      };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("new file mode")) current.kind = "added";
    else if (line.startsWith("deleted file mode")) current.kind = "deleted";
    else if (line.startsWith("rename from ")) {
      current.kind = "renamed";
      current.oldPath = line.slice("rename from ".length);
    } else if (line.startsWith("rename to ")) {
      current.path = line.slice("rename to ".length);
    } else if (line.startsWith("Binary files ")) {
      current.kind = "binary";
      current.binary = true;
      finalizeHunk();
    } else if (line.startsWith("--- ")) {
      const p = line.slice(4);
      if (p !== "/dev/null") {
        const stripped = p.replace(/^a\//, "").replace(/^"a\//, "").replace(/"$/, "");
        if (!current.oldPath && stripped !== current.path) current.oldPath = stripped;
      }
    } else if (line.startsWith("+++ ")) {
      const p = line.slice(4);
      if (p !== "/dev/null") {
        const stripped = p.replace(/^b\//, "").replace(/^"b\//, "").replace(/"$/, "");
        if (stripped) current.path = stripped;
      }
    } else if (line.startsWith("@@")) {
      finalizeHunk();
      const m = HUNK_RE.exec(line);
      if (!m) continue;
      hunk = {
        header: line,
        oldStart: Number(m[1]),
        oldLines: m[2] ? Number(m[2]) : 1,
        newStart: Number(m[3]),
        newLines: m[4] ? Number(m[4]) : 1,
        lines: []
      };
    } else if (hunk) {
      if (line.startsWith("+")) {
        hunk.lines.push({ kind: "+", text: line.slice(1) });
        current.additions++;
      } else if (line.startsWith("-")) {
        hunk.lines.push({ kind: "-", text: line.slice(1) });
        current.deletions++;
      } else if (line.startsWith(" ")) {
        hunk.lines.push({ kind: " ", text: line.slice(1) });
      } else if (line.startsWith("\\")) {
        hunk.lines.push({ kind: "\\", text: line.slice(1) });
      }
    }
  }
  finalizeFile();
  const totals = files.reduce(
    (acc, f) => {
      acc.additions += f.additions;
      acc.deletions += f.deletions;
      return acc;
    },
    { files: files.length, additions: 0, deletions: 0 }
  );
  return { files, totals };
}
var HUNK_RE;
var init_diff_parser = __esm({
  "src/collect/diff-parser.ts"() {
    "use strict";
    HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;
  }
});

// src/collect/jsonl-reader.ts
import { createReadStream, existsSync as existsSync4 } from "fs";
import { createInterface } from "readline";
function emptySummary() {
  return {
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    toolUses: /* @__PURE__ */ new Map(),
    totalToolCalls: 0,
    durationMs: 0,
    messageCount: 0
  };
}
function bump(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}
function digestEvent(event, into) {
  if (!event || typeof event !== "object") return;
  const e = event;
  into.messageCount++;
  if (typeof e.model === "string" && !into.model) into.model = e.model;
  const usage = e.usage ?? e.message?.usage;
  if (usage) {
    into.inputTokens += usage.input_tokens ?? 0;
    into.outputTokens += usage.output_tokens ?? 0;
    into.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
    into.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;
    into.totalTokens += usage.total_tokens ?? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
  }
  if (typeof e.duration_ms === "number") into.durationMs += e.duration_ms;
  const toolUses = e.tool_uses;
  if (Array.isArray(toolUses)) {
    for (const t of toolUses) {
      if (typeof t === "string") bump(into.toolUses, t);
      else if (t && typeof t === "object" && typeof t.name === "string") {
        bump(into.toolUses, t.name);
      }
      into.totalToolCalls++;
    }
  }
  if (typeof e.tool_use_name === "string") {
    bump(into.toolUses, e.tool_use_name);
    into.totalToolCalls++;
  }
  const content = e.message?.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part && typeof part === "object") {
        const p = part;
        if (p.type === "tool_use" && typeof p.name === "string") {
          bump(into.toolUses, p.name);
          into.totalToolCalls++;
        }
      }
    }
  }
  if (typeof e.result === "string" && !into.result) into.result = e.result;
}
async function readTranscript(filePath) {
  const summary = emptySummary();
  if (!existsSync4(filePath)) return summary;
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });
  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const event = JSON.parse(line);
      digestEvent(event, summary);
    } catch {
    }
  }
  return summary;
}
var init_jsonl_reader = __esm({
  "src/collect/jsonl-reader.ts"() {
    "use strict";
  }
});

// src/collect/token-tracker.ts
import { existsSync as existsSync5, readFileSync as readFileSync3 } from "fs";
async function buildAgentReport(agent) {
  let rawDiff = "";
  if (agent.diffPath && existsSync5(agent.diffPath)) {
    const parsed = JSON.parse(readFileSync3(agent.diffPath, "utf8"));
    rawDiff = parsed.unified ?? "";
  }
  const diff = parseUnifiedDiff(rawDiff);
  const transcript = agent.transcriptPath ? await readTranscript(agent.transcriptPath) : emptySummary();
  return { agent, diff, transcript, rawDiff };
}
var init_token_tracker = __esm({
  "src/collect/token-tracker.ts"() {
    "use strict";
    init_diff_parser();
    init_jsonl_reader();
  }
});

// src/tui/session.ts
async function loadSession(repoRoot) {
  const state = loadState(repoRoot);
  const reports = await Promise.all(state.agents.map((a) => buildAgentReport(a)));
  return reports.map((report) => ({ report, decision: "pending" }));
}
function summarizeFiles(view) {
  const { totals } = view.report.diff;
  return `${totals.files} files  +${totals.additions} -${totals.deletions}`;
}
function summarizeTokens(view) {
  const t = view.report.transcript;
  if (t.totalTokens === 0 && t.totalToolCalls === 0) return "no transcript";
  const tk = t.totalTokens.toLocaleString();
  return `${tk} tok  ${t.totalToolCalls} tools`;
}
var init_session = __esm({
  "src/tui/session.ts"() {
    "use strict";
    init_token_tracker();
    init_state();
  }
});

// src/tui/tab-bar.tsx
import { Box as Box3, Text as Text3 } from "ink";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var TabBar;
var init_tab_bar = __esm({
  "src/tui/tab-bar.tsx"() {
    "use strict";
    init_styles();
    TabBar = ({ agents, activeIndex, decisions }) => /* @__PURE__ */ jsx3(Box3, { flexDirection: "row", borderStyle: "round", borderColor: theme.accent, paddingX: 1, children: agents.length === 0 ? /* @__PURE__ */ jsx3(Text3, { color: theme.muted, children: "no subagents recorded \u2014 run a Task first" }) : agents.map((a, i) => {
      const active = i === activeIndex;
      const decision = decisions[i] ?? "pending";
      return /* @__PURE__ */ jsxs3(Box3, { marginRight: 2, children: [
        /* @__PURE__ */ jsxs3(Text3, { color: active ? theme.accent : theme.muted, children: [
          active ? "\u258D" : " ",
          i + 1,
          "."
        ] }),
        /* @__PURE__ */ jsxs3(Text3, { color: active ? "white" : theme.muted, bold: active, children: [
          " ",
          a.report.agent.name,
          " "
        ] }),
        /* @__PURE__ */ jsx3(Text3, { color: decisionColor[decision], children: decisionGlyph[decision] })
      ] }, a.report.agent.id);
    }) });
  }
});

// src/tui/app.tsx
import { Box as Box4, Text as Text4, useApp, useInput } from "ink";
import { useCallback, useEffect, useMemo as useMemo2, useReducer, useState } from "react";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var App, MergeStatusLine;
var init_app = __esm({
  "src/tui/app.tsx"() {
    "use strict";
    init_approver();
    init_conflict_detector();
    init_conflict_view();
    init_diff_view();
    init_hotkeys();
    init_session();
    init_styles();
    init_tab_bar();
    App = ({
      agents,
      repoRoot,
      onStateChange,
      mergeImpl = applyApproved
    }) => {
      const app = useApp();
      const [state, dispatch] = useReducer(reduce, agents.length, initialState);
      const [mergeStatus, setMergeStatus] = useState({ kind: "idle" });
      const reports = useMemo2(() => agents.map((a) => a.report), [agents]);
      const conflicts = useMemo2(() => detectConflicts(reports), [reports]);
      const triggerMerge = useCallback(async () => {
        if (!repoRoot) {
          setMergeStatus({ kind: "error", message: "merge unavailable: no repoRoot passed to App" });
          return;
        }
        const approvedIds = /* @__PURE__ */ new Set();
        agents.forEach((a, i) => {
          if (state.decisions[i] === "approved") approvedIds.add(a.report.agent.id);
        });
        if (approvedIds.size === 0) {
          setMergeStatus({ kind: "error", message: "no agents approved yet" });
          return;
        }
        setMergeStatus({ kind: "running" });
        try {
          const result = await mergeImpl(reports, approvedIds, { repoRoot });
          setMergeStatus({ kind: "done", result });
        } catch (err) {
          setMergeStatus({
            kind: "error",
            message: err instanceof Error ? err.message : String(err)
          });
        }
      }, [agents, mergeImpl, reports, repoRoot, state.decisions]);
      useInput((input, key) => {
        const action = mapKey({ input, key: { ...key } });
        if (action.type === "quit") {
          app.exit();
          return;
        }
        dispatch(action);
        if (action.type === "merge") void triggerMerge();
      });
      useEffect(() => {
        onStateChange?.(state);
      }, [state, onStateChange]);
      const active = agents[state.activeIndex];
      const conflictsForActive = conflicts.filter(
        (c) => c.participants.some((p) => p.agentId === active?.report.agent.id)
      );
      return /* @__PURE__ */ jsxs4(Box4, { flexDirection: "column", children: [
        /* @__PURE__ */ jsx4(TabBar, { agents, activeIndex: state.activeIndex, decisions: state.decisions }),
        state.mode === "conflict" ? /* @__PURE__ */ jsx4(ConflictView, { conflicts: conflictsForActive }) : active ? /* @__PURE__ */ jsxs4(Box4, { flexDirection: "column", children: [
          /* @__PURE__ */ jsx4(Box4, { paddingX: 1, children: /* @__PURE__ */ jsxs4(Text4, { color: theme.muted, children: [
            summarizeFiles(active),
            " \xB7 ",
            summarizeTokens(active),
            " \xB7 branch",
            " ",
            active.report.agent.branch,
            conflictsForActive.length > 0 ? /* @__PURE__ */ jsxs4(Text4, { color: theme.warning, children: [
              " ",
              "\xB7 \u26A0 ",
              conflictsForActive.length,
              " conflict",
              conflictsForActive.length > 1 ? "s" : ""
            ] }) : null
          ] }) }),
          /* @__PURE__ */ jsx4(DiffView, { report: active.report, scroll: state.scroll })
        ] }) : /* @__PURE__ */ jsx4(Box4, { paddingX: 1, paddingY: 1, children: /* @__PURE__ */ jsx4(Text4, { color: theme.muted, children: "no subagents yet \u2014 wisp-agentdiff records them automatically when Claude Code spawns a Task with isolation: worktree." }) }),
        /* @__PURE__ */ jsx4(MergeStatusLine, { status: mergeStatus }),
        /* @__PURE__ */ jsx4(Box4, { paddingX: 1, marginTop: 1, children: /* @__PURE__ */ jsx4(Text4, { color: theme.muted, children: "[a]pprove [r]evert [n]ext [p]rev [c]onflict [m]erge [j/k] scroll [q]uit" }) })
      ] });
    };
    MergeStatusLine = ({ status }) => {
      if (status.kind === "idle") return null;
      if (status.kind === "running")
        return /* @__PURE__ */ jsx4(Box4, { paddingX: 1, children: /* @__PURE__ */ jsx4(Text4, { color: theme.warning, children: "merging approved agents\u2026" }) });
      if (status.kind === "error")
        return /* @__PURE__ */ jsx4(Box4, { paddingX: 1, children: /* @__PURE__ */ jsxs4(Text4, { color: theme.removed, children: [
          "merge error: ",
          status.message
        ] }) });
      const result = status.result;
      if (result.blockedConflicts.length > 0) {
        return /* @__PURE__ */ jsx4(Box4, { paddingX: 1, children: /* @__PURE__ */ jsxs4(Text4, { color: theme.removed, children: [
          "merge blocked \u2014 ",
          result.blockedConflicts.length,
          " approved-vs-approved file",
          result.blockedConflicts.length > 1 ? "s" : "",
          " conflict. Revert one of the colliding agents and try again."
        ] }) });
      }
      const merged = result.merged.filter((m) => m.status === "merged").length;
      const failed = result.merged.find((m) => m.status === "failed");
      return /* @__PURE__ */ jsx4(Box4, { paddingX: 1, children: failed ? /* @__PURE__ */ jsxs4(Text4, { color: theme.removed, children: [
        "merge halted on ",
        failed.agentName,
        ": ",
        failed.message
      ] }) : /* @__PURE__ */ jsxs4(Text4, { color: theme.added, children: [
        "merged ",
        merged,
        " agent",
        merged === 1 ? "" : "s",
        " into HEAD"
      ] }) });
    };
  }
});

// src/tui/run.ts
var run_exports = {};
__export(run_exports, {
  runReviewTui: () => runReviewTui
});
import { render } from "ink";
import React from "react";
async function runReviewTui(options) {
  const agents = await loadSession(options.repoRoot);
  const instance = render(React.createElement(App, { agents, repoRoot: options.repoRoot }));
  await instance.waitUntilExit();
}
var init_run = __esm({
  "src/tui/run.ts"() {
    "use strict";
    init_app();
    init_session();
  }
});

// src/demo.ts
var demo_exports = {};
__export(demo_exports, {
  seedDemo: () => seedDemo
});
import { mkdirSync as mkdirSync6, writeFileSync as writeFileSync3 } from "fs";
import { dirname as dirname6, join as join4 } from "path";
function seedDemo(repoRoot) {
  const now = /* @__PURE__ */ new Date("2026-05-18T20:00:00Z");
  const state = {
    version: 1,
    sessionStartedAt: now.toISOString(),
    repoRoot,
    agents: []
  };
  for (const agent of DEMO_AGENTS) {
    const diffPath = diffStoragePath(repoRoot, agent.id);
    mkdirSync6(dirname6(diffPath), { recursive: true });
    writeFileSync3(
      diffPath,
      JSON.stringify(
        {
          agentId: agent.id,
          branch: `wisp-agentdiff/agent-${agent.name}`,
          baseRef: agent.baseRef,
          capturedAt: now.toISOString(),
          unified: agent.diff,
          nameStatus: ""
        },
        null,
        2
      ),
      "utf8"
    );
    state.agents.push({
      id: agent.id,
      name: agent.name,
      path: join4(repoRoot, ".claude", "worktrees", "wisp-agentdiff", agent.name),
      branch: `wisp-agentdiff/agent-${agent.name}`,
      baseRef: agent.baseRef,
      createdAt: now.toISOString(),
      completedAt: now.toISOString(),
      diffPath,
      status: "captured"
    });
  }
  saveState(repoRoot, state);
}
var DEMO_AGENTS;
var init_demo = __esm({
  "src/demo.ts"() {
    "use strict";
    init_state();
    DEMO_AGENTS = [
      {
        id: "demo-auth",
        name: "auth",
        baseRef: "deadbeef0001",
        filesChanged: 2,
        diff: `diff --git a/src/auth/session.ts b/src/auth/session.ts
index 1111111..2222222 100644
--- a/src/auth/session.ts
+++ b/src/auth/session.ts
@@ -1,5 +1,9 @@
 export interface Session {
   id: string;
+  userId: string;
+  createdAt: Date;
+  expiresAt: Date;
 }
+
+export function rotateToken(s: Session): Session { return { ...s }; }
diff --git a/src/auth/middleware.ts b/src/auth/middleware.ts
index 3333333..4444444 100644
--- a/src/auth/middleware.ts
+++ b/src/auth/middleware.ts
@@ -8,7 +8,7 @@ export function requireAuth(req: Req) {
-  if (!req.session) throw new Error("no session");
+  if (!req.session || isExpired(req.session)) throw new Unauthorized();
   return req.session;
 }
`
      },
      {
        id: "demo-api",
        name: "api",
        baseRef: "deadbeef0001",
        filesChanged: 3,
        diff: `diff --git a/src/api/routes.ts b/src/api/routes.ts
index aaaa..bbbb 100644
--- a/src/api/routes.ts
+++ b/src/api/routes.ts
@@ -12,6 +12,12 @@ export function register(app: App) {
   app.get("/users/:id", getUser);
   app.post("/users", createUser);
+  app.patch("/users/:id", patchUser);
+  app.delete("/users/:id", deleteUser);
 }
diff --git a/src/db/pool.ts b/src/db/pool.ts
index cccc..dddd 100644
--- a/src/db/pool.ts
+++ b/src/db/pool.ts
@@ -22,7 +22,9 @@ export class Pool {
   constructor(opts: Opts) {
     this.url = opts.url;
+    this.retries = opts.retries ?? 3;
+    this.timeoutMs = opts.timeoutMs ?? 5000;
     this.client = makeClient(opts);
   }
`
      },
      {
        id: "demo-db",
        name: "db",
        baseRef: "deadbeef0001",
        filesChanged: 4,
        diff: `diff --git a/src/db/pool.ts b/src/db/pool.ts
index cccc..eeee 100644
--- a/src/db/pool.ts
+++ b/src/db/pool.ts
@@ -1,20 +1,40 @@
-export class Pool {
+// Complete rewrite \u2014 switched to a custom retry loop
+// and removed timeout config. (this is the rogue agent.)
+export class Pool {
   constructor(opts: Opts) {
-    this.url = opts.url;
-    this.client = makeClient(opts);
+    this.url = String(opts.url);
+    this.client = unsafeMakeClient(opts);
   }
+  query(sql: string) { /* retry loop, no timeout */ }
+}
+function unsafeMakeClient(_: Opts) { return null as any; }
diff --git a/src/db/session.ts b/src/db/session.ts
index 5555..6666 100644
--- a/src/db/session.ts
+++ b/src/db/session.ts
@@ -3,6 +3,7 @@ export function open(pool: Pool): Session {
   return {
     id: nanoid(),
+    createdAt: new Date(),
     pool,
   };
 }
`
      },
      {
        id: "demo-tests",
        name: "tests",
        baseRef: "deadbeef0001",
        filesChanged: 2,
        diff: `diff --git a/tests/auth.test.ts b/tests/auth.test.ts
new file mode 100644
index 0000000..7777777
--- /dev/null
+++ b/tests/auth.test.ts
@@ -0,0 +1,12 @@
+import { describe, expect, it } from "vitest";
+import { rotateToken } from "../src/auth/session.js";
+describe("rotateToken", () => {
+  it("preserves id", () => {
+    expect(rotateToken({ id: "x" } as any).id).toBe("x");
+  });
+});
diff --git a/tests/api.test.ts b/tests/api.test.ts
new file mode 100644
index 0000000..8888888
--- /dev/null
+++ b/tests/api.test.ts
@@ -0,0 +1,8 @@
+import { expect, it } from "vitest";
+it("registers all routes", () => { expect(true).toBe(true); });
`
      },
      {
        id: "demo-docs",
        name: "docs",
        baseRef: "deadbeef0001",
        filesChanged: 1,
        diff: `diff --git a/docs/auth.md b/docs/auth.md
new file mode 100644
index 0000000..9999999
--- /dev/null
+++ b/docs/auth.md
@@ -0,0 +1,18 @@
+# Authentication
+
+Sessions are short-lived and rotated on every privileged action.
+
+## Endpoints
+
+| Method | Path | Note |
+|--------|------|------|
+| POST   | /login | issues a session |
+| POST   | /logout | revokes it |
+| PATCH  | /session | rotates the token |
`
      }
    ];
  }
});

// src/index.ts
import { readFileSync as readFileSync4 } from "fs";
import { dirname as dirname7, join as join5 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
import { Command } from "commander";

// src/wrap/post-spawn-hook.ts
init_state();
import { mkdirSync as mkdirSync3, writeFileSync as writeFileSync2 } from "fs";
import { dirname as dirname3 } from "path";

// src/wrap/worktree-manager.ts
import { existsSync as existsSync2, mkdirSync as mkdirSync2, realpathSync, rmSync } from "fs";
import { dirname as dirname2, join as join2, resolve as resolve2 } from "path";
import { simpleGit } from "simple-git";
function normalizePath(p) {
  const abs = resolve2(p);
  try {
    return realpathSync.native ? realpathSync.native(abs) : realpathSync(abs);
  } catch {
    return abs;
  }
}
var SAFE_NAME = /[^a-zA-Z0-9._-]+/g;
var RESERVED_NAMES = /* @__PURE__ */ new Set([".", "..", "HEAD"]);
function sanitizeName(name) {
  const slug = name.replace(SAFE_NAME, "-").replace(/^[-.]+|[-.]+$/g, "");
  if (!slug) throw new Error(`worktree name resolves to empty slug: ${name}`);
  if (RESERVED_NAMES.has(slug)) {
    throw new Error(`worktree name '${name}' resolves to reserved slug '${slug}'`);
  }
  if (slug.includes("..") || slug.includes("/") || slug.includes("\\")) {
    throw new Error(`worktree name '${name}' contains path-separator or traversal chars`);
  }
  return slug;
}
var REFNAME_RE = /^[\w][\w./-]{0,199}$/;
function assertValidRef(ref) {
  if (!REFNAME_RE.test(ref)) {
    throw new Error(`invalid git ref '${ref}' \u2014 expected ^[\\w][\\w./-]{0,199}$`);
  }
}
function defaultBasePath(repoRoot) {
  return join2(repoRoot, ".claude", "worktrees", "wisp-agentdiff");
}
var WorktreeManager = class {
  git;
  repoRoot;
  constructor(repoRoot) {
    this.repoRoot = resolve2(repoRoot);
    this.git = simpleGit(this.repoRoot);
  }
  async resolveHead() {
    const sha = (await this.git.revparse(["HEAD"])).trim();
    if (!sha) throw new Error("could not resolve HEAD \u2014 is this a git repo?");
    return sha;
  }
  async create(opts) {
    const safeName = sanitizeName(opts.name);
    const branchPrefix = opts.branchPrefix ?? "wisp-agentdiff/agent-";
    const branch = `${branchPrefix}${safeName}`;
    const basePath = opts.basePath ?? defaultBasePath(this.repoRoot);
    const path = join2(basePath, safeName);
    const baseRef = opts.baseRef ?? await this.resolveHead();
    assertValidRef(baseRef);
    if (existsSync2(path)) {
      throw new Error(`worktree path already exists: ${path}`);
    }
    mkdirSync2(dirname2(path), { recursive: true });
    await this.git.raw(["worktree", "add", "-b", branch, path, "--", baseRef]);
    return { name: safeName, path: normalizePath(path), branch, baseRef };
  }
  async list() {
    const out = await this.git.raw(["worktree", "list", "--porcelain"]);
    const entries = [];
    let current = {};
    for (const line of out.split(/\r?\n/)) {
      if (line.startsWith("worktree ")) {
        if (current.path) entries.push(current);
        current = { path: normalizePath(line.slice("worktree ".length)), head: "", bare: false };
      } else if (line.startsWith("HEAD ")) {
        current.head = line.slice("HEAD ".length);
      } else if (line.startsWith("branch ")) {
        current.branch = line.slice("branch ".length);
      } else if (line === "bare") {
        current.bare = true;
      }
    }
    if (current.path) entries.push(current);
    return entries;
  }
  /**
   * Commit any pending changes inside the worktree to its branch.
   * Used by the post-spawn hook to capture subagent edits before review.
   */
  async commitPending(worktreePath, message) {
    const sub = simpleGit(worktreePath);
    const status = await sub.status();
    if (status.files.length === 0) return null;
    await sub.add(["-A"]);
    const afterAdd = await sub.status();
    if (afterAdd.staged.length === 0) return null;
    try {
      const result = await sub.commit(message, [], { "--no-verify": null });
      return result.commit || null;
    } catch (err) {
      if (process.env.WISP_DEBUG) process.stderr.write(`commitPending: ${String(err)}
`);
      return null;
    }
  }
  /**
   * Diff a worktree branch against a base ref. Returns full unified diff text.
   */
  async diffAgainst(branch, baseRef) {
    return await this.git.raw(["diff", `${baseRef}...${branch}`]);
  }
  async diffNameStatus(branch, baseRef) {
    return await this.git.raw(["diff", "--name-status", `${baseRef}...${branch}`]);
  }
  async remove(worktreePath, options = {}) {
    const args = ["worktree", "remove"];
    if (options.force) args.push("--force");
    args.push(worktreePath);
    await this.git.raw(args);
  }
  async deleteBranch(branch, options = {}) {
    await this.git.raw(["branch", options.force ? "-D" : "-d", branch]);
  }
  async pruneIfMissing(worktreePath) {
    if (!existsSync2(worktreePath)) {
      await this.git.raw(["worktree", "prune"]);
      return;
    }
    rmSync(worktreePath, { recursive: true, force: true });
    await this.git.raw(["worktree", "prune"]);
  }
};

// src/wrap/post-spawn-hook.ts
async function handleWorktreeRemove(payload, deps) {
  if (!payload.name) throw new Error("WorktreeRemove payload missing required `name`");
  const now = deps.now ?? (() => /* @__PURE__ */ new Date());
  const manager = deps.manager ?? new WorktreeManager(deps.repoRoot);
  let state = loadState(deps.repoRoot);
  const agent = (payload.agentId ? state.agents.find((a) => a.id === payload.agentId) : void 0) ?? state.agents.find((a) => a.name === payload.name);
  if (!agent) {
    throw new Error(`no recorded agent for worktree '${payload.name}'`);
  }
  await manager.commitPending(agent.path, "wisp-agentdiff: capture subagent edits");
  const unified = await manager.diffAgainst(agent.branch, agent.baseRef);
  const nameStatus = await manager.diffNameStatus(agent.branch, agent.baseRef);
  const filesChanged = nameStatus.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
  const diffPath = diffStoragePath(deps.repoRoot, agent.id);
  mkdirSync3(dirname3(diffPath), { recursive: true });
  const payloadOut = {
    agentId: agent.id,
    branch: agent.branch,
    baseRef: agent.baseRef,
    capturedAt: now().toISOString(),
    unified,
    nameStatus
  };
  writeFileSync2(diffPath, JSON.stringify(payloadOut, null, 2), "utf8");
  let removed = false;
  if (!payload.keep) {
    await manager.remove(agent.path, { force: true });
    removed = true;
  }
  const next = {
    ...agent,
    completedAt: now().toISOString(),
    diffPath,
    ...payload.transcriptPath ? { transcriptPath: payload.transcriptPath } : {},
    status: removed ? "removed" : "captured"
  };
  state = upsertAgent(state, next);
  saveState(deps.repoRoot, state);
  return { agentId: agent.id, removed, diffPath, filesChanged };
}

// src/wrap/pre-spawn-hook.ts
init_state();
import { mkdirSync as mkdirSync4 } from "fs";
import { dirname as dirname4 } from "path";
async function handleWorktreeCreate(payload, deps) {
  if (!payload.name) throw new Error("WorktreeCreate payload missing required `name`");
  const now = deps.now ?? (() => /* @__PURE__ */ new Date());
  const manager = deps.manager ?? new WorktreeManager(deps.repoRoot);
  const created = await manager.create({
    name: payload.name,
    ...payload.baseRef !== void 0 ? { baseRef: payload.baseRef } : {}
  });
  const agentId = payload.agentId ?? `agent-${created.name}-${now().getTime().toString(36)}`;
  mkdirSync4(dirname4(created.path), { recursive: true });
  let state = loadState(deps.repoRoot);
  state = upsertAgent(state, {
    id: agentId,
    name: created.name,
    path: created.path,
    branch: created.branch,
    baseRef: created.baseRef,
    createdAt: now().toISOString(),
    status: "running"
  });
  saveState(deps.repoRoot, state);
  return { path: created.path, branch: created.branch, agentId };
}

// src/index.ts
var PKG_VERSION = readPackageVersion();
var program = new Command();
program.name("wisp-agentdiff").description("Per-agent diffs for Claude Code parallel subagent workflows").version(PKG_VERSION);
program.command("install").description("Install wisp-agentdiff skill, slash command, and hook snippet into ~/.claude").option("--target <dir>", "override target directory (default ~/.claude or $CLAUDE_CONFIG_DIR)").action(async (opts) => {
  const { installArtifacts: installArtifacts2 } = await Promise.resolve().then(() => (init_install(), install_exports));
  try {
    installArtifacts2({
      ...opts.target ? { targetDir: opts.target } : {}
    });
  } catch (err) {
    process.stderr.write(`install failed: ${err instanceof Error ? err.message : String(err)}
`);
    process.exit(1);
  }
});
program.command("review").description("Open the TUI to review per-agent diffs of the current session").option("--repo <dir>", "repository root", process.cwd()).action(async (opts) => {
  const { runReviewTui: runReviewTui2 } = await Promise.resolve().then(() => (init_run(), run_exports));
  await runReviewTui2({ repoRoot: opts.repo });
});
program.command("demo").description("Seed a synthetic 5-agent session so 'review' has data (used by the demo GIF)").option("--repo <dir>", "repository root", process.cwd()).action(async (opts) => {
  const { seedDemo: seedDemo2 } = await Promise.resolve().then(() => (init_demo(), demo_exports));
  seedDemo2(opts.repo);
  process.stdout.write("seeded demo state \u2014 run: wisp-agentdiff review\n");
});
var hook = program.command("hook").description("Native Claude Code worktree hook entry points (stdin JSON \u2192 stdout JSON)");
hook.command("worktree-create").description("Handle WorktreeCreate hook (stdin payload, prints path to stdout)").option("--repo <dir>", "repository root", process.cwd()).action(async (opts) => {
  const payload = readStdinJson();
  const result = await handleWorktreeCreate(payload, { repoRoot: opts.repo });
  process.stdout.write(`${result.path}
`);
  if (process.env.WISP_DEBUG) process.stderr.write(`${JSON.stringify(result)}
`);
});
hook.command("worktree-remove").description("Handle WorktreeRemove hook (stdin payload, captures diff then removes)").option("--repo <dir>", "repository root", process.cwd()).action(async (opts) => {
  const payload = readStdinJson();
  const result = await handleWorktreeRemove(payload, { repoRoot: opts.repo });
  process.stdout.write(`${JSON.stringify(result)}
`);
});
var MAX_STDIN_BYTES = 1 * 1024 * 1024;
function readStdinJson() {
  if (process.stdin.isTTY) {
    throw new Error(
      "expected JSON payload on stdin (hooks pipe their payload \u2014 don't invoke this subcommand interactively)"
    );
  }
  const buf = readFileSync4(0);
  if (buf.length > MAX_STDIN_BYTES) {
    throw new Error(`stdin payload exceeds ${MAX_STDIN_BYTES} bytes`);
  }
  const raw = buf.toString("utf8").trim();
  if (!raw) throw new Error("expected JSON payload on stdin");
  return JSON.parse(raw);
}
function readPackageVersion() {
  try {
    const thisFile = fileURLToPath2(import.meta.url);
    const pkgPath = join5(dirname7(thisFile), "..", "package.json");
    const pkg = JSON.parse(readFileSync4(pkgPath, "utf8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
program.parseAsync(process.argv).catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`wisp-agentdiff: ${msg}
`);
  process.exit(1);
});
//# sourceMappingURL=index.js.map
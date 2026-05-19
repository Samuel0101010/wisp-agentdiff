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

// src/wrap/debug-log.ts
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from "fs";
import { dirname, join } from "path";
function debugLogPath(repoRoot) {
  return join(repoRoot, ".claude", "wisp-agentdiff", "debug.log");
}
function logHookEvent(repoRoot, event, data) {
  try {
    const path = debugLogPath(repoRoot);
    mkdirSync(dirname(path), { recursive: true });
    const line = `${(/* @__PURE__ */ new Date()).toISOString()}  ${event}  ${JSON.stringify(data)}
`;
    if (existsSync(path)) {
      try {
        const size = statSync(path).size;
        if (size > MAX_LOG_BYTES) {
          const buf = readFileSync(path);
          const keep = buf.subarray(buf.length - Math.floor(MAX_LOG_BYTES / 2));
          writeFileSync(path, keep);
        }
      } catch {
      }
    }
    appendFileSync(path, line, "utf8");
  } catch {
  }
}
var MAX_LOG_BYTES;
var init_debug_log = __esm({
  "src/wrap/debug-log.ts"() {
    "use strict";
    MAX_LOG_BYTES = 64 * 1024;
  }
});

// src/wrap/resolve-repo-root.ts
import { realpathSync } from "fs";
import { resolve } from "path";
import { simpleGit } from "simple-git";
function normalizePath(p) {
  const abs = resolve(p);
  try {
    return realpathSync.native ? realpathSync.native(abs) : realpathSync(abs);
  } catch {
    return abs;
  }
}
function stripInnerWorktreeSegment(path) {
  const match = path.match(INNER_WORKTREE_RE);
  if (!match) return null;
  return path.slice(0, path.length - match[0].length);
}
async function resolveOuterRepoRoot(cwd) {
  let current = normalizePath(cwd);
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let toplevel;
    try {
      const raw = await simpleGit(current).revparse(["--show-toplevel"]);
      toplevel = raw.trim();
    } catch {
      return current;
    }
    if (!toplevel) return current;
    const normalizedToplevel = normalizePath(toplevel);
    const prefix = stripInnerWorktreeSegment(normalizedToplevel);
    if (!prefix) {
      return normalizedToplevel;
    }
    current = normalizePath(prefix);
  }
  return current;
}
var INNER_WORKTREE_RE, MAX_ITERATIONS;
var init_resolve_repo_root = __esm({
  "src/wrap/resolve-repo-root.ts"() {
    "use strict";
    INNER_WORKTREE_RE = /[/\\]\.claude[/\\]worktrees[/\\]wisp-agentdiff[/\\]agent-[a-f0-9]+$/i;
    MAX_ITERATIONS = 10;
  }
});

// src/wrap/state.ts
import { existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync as readFileSync2, writeFileSync as writeFileSync2 } from "fs";
import { dirname as dirname2, join as join2, resolve as resolve2 } from "path";
function stateFilePath(repoRoot) {
  return resolve2(repoRoot, STATE_FILE);
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
  if (!existsSync2(file)) return freshState(repoRoot);
  const raw = readFileSync2(file, "utf8");
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
  mkdirSync2(dirname2(file), { recursive: true });
  writeFileSync2(file, JSON.stringify(state, null, 2), "utf8");
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
  return join2(repoRoot, ".claude", "wisp-agentdiff", "diffs", `${agentId}.json`);
}
var STATE_FILE;
var init_state = __esm({
  "src/wrap/state.ts"() {
    "use strict";
    STATE_FILE = ".claude/wisp-agentdiff-state.json";
  }
});

// src/wrap/worktree-manager.ts
import { existsSync as existsSync3, mkdirSync as mkdirSync3, realpathSync as realpathSync2, rmSync } from "fs";
import { dirname as dirname3, join as join3, resolve as resolve3 } from "path";
import { simpleGit as simpleGit2 } from "simple-git";
function normalizePath2(p) {
  const abs = resolve3(p);
  try {
    return realpathSync2.native ? realpathSync2.native(abs) : realpathSync2(abs);
  } catch {
    return abs;
  }
}
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
function assertValidRef(ref) {
  if (!REFNAME_RE.test(ref)) {
    throw new Error(`invalid git ref '${ref}' \u2014 expected ^[\\w][\\w./-]{0,199}$`);
  }
}
function defaultBasePath(repoRoot) {
  return join3(repoRoot, ".claude", "worktrees", "wisp-agentdiff");
}
var SAFE_NAME, RESERVED_NAMES, REFNAME_RE, WorktreeManager;
var init_worktree_manager = __esm({
  "src/wrap/worktree-manager.ts"() {
    "use strict";
    SAFE_NAME = /[^a-zA-Z0-9._-]+/g;
    RESERVED_NAMES = /* @__PURE__ */ new Set([".", "..", "HEAD"]);
    REFNAME_RE = /^[\w][\w./-]{0,199}$/;
    WorktreeManager = class {
      git;
      repoRoot;
      constructor(repoRoot) {
        this.repoRoot = resolve3(repoRoot);
        this.git = simpleGit2(this.repoRoot);
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
        const path = join3(basePath, safeName);
        const baseRef = opts.baseRef ?? await this.resolveHead();
        assertValidRef(baseRef);
        if (existsSync3(path)) {
          throw new Error(`worktree path already exists: ${path}`);
        }
        mkdirSync3(dirname3(path), { recursive: true });
        await this.git.raw(["worktree", "add", "-b", branch, path, "--", baseRef]);
        return { name: safeName, path: normalizePath2(path), branch, baseRef };
      }
      async list() {
        const out = await this.git.raw(["worktree", "list", "--porcelain"]);
        const entries = [];
        let current = {};
        for (const line of out.split(/\r?\n/)) {
          if (line.startsWith("worktree ")) {
            if (current.path) entries.push(current);
            current = { path: normalizePath2(line.slice("worktree ".length)), head: "", bare: false };
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
        const sub = simpleGit2(worktreePath);
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
        if (!existsSync3(worktreePath)) {
          await this.git.raw(["worktree", "prune"]);
          return;
        }
        rmSync(worktreePath, { recursive: true, force: true });
        await this.git.raw(["worktree", "prune"]);
      }
    };
  }
});

// src/wrap/pending-tasks.ts
import { existsSync as existsSync5, mkdirSync as mkdirSync5, readFileSync as readFileSync3, writeFileSync as writeFileSync4 } from "fs";
import { dirname as dirname5, resolve as resolve4 } from "path";
function pendingTasksPath(repoRoot) {
  return resolve4(repoRoot, PENDING_FILE);
}
function freshPending() {
  return { version: 1, tasks: [] };
}
function loadPending(repoRoot) {
  const file = pendingTasksPath(repoRoot);
  if (!existsSync5(file)) return freshPending();
  let raw;
  try {
    raw = readFileSync3(file, "utf8");
  } catch {
    return freshPending();
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return freshPending();
  }
  if (!isValidPending(parsed)) return freshPending();
  return parsed;
}
function isValidPending(value) {
  if (!value || typeof value !== "object") return false;
  const v = value;
  if (v.version !== 1) return false;
  if (!Array.isArray(v.tasks)) return false;
  if (v.consumed !== void 0 && !Array.isArray(v.consumed)) return false;
  return true;
}
function savePending(repoRoot, state) {
  const file = pendingTasksPath(repoRoot);
  mkdirSync5(dirname5(file), { recursive: true });
  writeFileSync4(file, JSON.stringify(state, null, 2), "utf8");
}
function enqueueTask(repoRoot, task) {
  const state = loadPending(repoRoot);
  state.tasks.push(task);
  savePending(repoRoot, state);
}
function hasSeenToolUseId(state, id) {
  if (!id) return false;
  if (state.consumed?.includes(id)) return true;
  for (const t of state.tasks) {
    if (t.toolUseId === id) return true;
  }
  return false;
}
function isStale(task, ttlMs, now) {
  const ts = Date.parse(task.queuedAt);
  if (Number.isNaN(ts)) return true;
  return now - ts > ttlMs;
}
function rememberConsumed(state, id) {
  if (!id) return;
  const list = state.consumed ?? [];
  list.push(id);
  if (list.length > CONSUMED_CAP) {
    list.splice(0, list.length - CONSUMED_CAP);
  }
  state.consumed = list;
}
function dequeueOldestUnstale(repoRoot, ttlMs = DEFAULT_TTL_MS, now = Date.now()) {
  const state = loadPending(repoRoot);
  state.tasks = state.tasks.filter((t) => !isStale(t, ttlMs, now));
  if (state.tasks.length === 0) {
    savePending(repoRoot, state);
    return null;
  }
  const next = state.tasks.shift() ?? null;
  if (next?.toolUseId) rememberConsumed(state, next.toolUseId);
  savePending(repoRoot, state);
  return next;
}
var PENDING_FILE, DEFAULT_TTL_MS, CONSUMED_CAP;
var init_pending_tasks = __esm({
  "src/wrap/pending-tasks.ts"() {
    "use strict";
    PENDING_FILE = ".claude/wisp-agentdiff/pending-tasks.json";
    DEFAULT_TTL_MS = 6e4;
    CONSUMED_CAP = 200;
  }
});

// src/install.ts
var install_exports = {};
__export(install_exports, {
  defaultTargetDir: () => defaultTargetDir,
  installArtifacts: () => installArtifacts,
  resolvePackageRoot: () => resolvePackageRoot
});
import { copyFileSync, existsSync as existsSync7, mkdirSync as mkdirSync7, readFileSync as readFileSync4 } from "fs";
import { homedir } from "os";
import { dirname as dirname7, join as join4, resolve as resolve5 } from "path";
import { fileURLToPath } from "url";
function defaultTargetDir() {
  return process.env.CLAUDE_CONFIG_DIR ? resolve5(process.env.CLAUDE_CONFIG_DIR) : join4(homedir(), ".claude");
}
function resolvePackageRoot() {
  const thisFile = fileURLToPath(import.meta.url);
  return resolve5(dirname7(thisFile), "..");
}
function installArtifacts(options = {}) {
  const target = options.targetDir ?? defaultTargetDir();
  const pkgRoot = options.packageRoot ?? resolvePackageRoot();
  const skillSrc = join4(pkgRoot, "skills", "wisp-agentdiff", "SKILL.md");
  const cmdSrc = join4(pkgRoot, "commands", "review-agents.md");
  const hookSrc = join4(pkgRoot, "templates", "hooks-snippet.json");
  for (const p of [skillSrc, cmdSrc, hookSrc]) {
    if (!existsSync7(p)) {
      throw new Error(`required artifact not found at ${p} \u2014 reinstall wisp-agentdiff`);
    }
  }
  const skillDst = join4(target, "skills", "wisp-agentdiff", "SKILL.md");
  mkdirSync7(dirname7(skillDst), { recursive: true });
  copyFileSync(skillSrc, skillDst);
  const cmdDst = join4(target, "commands", "review-agents.md");
  mkdirSync7(dirname7(cmdDst), { recursive: true });
  copyFileSync(cmdSrc, cmdDst);
  if (options.printHookSnippet !== false) {
    const snippet = readFileSync4(hookSrc, "utf8");
    process.stdout.write("\n");
    process.stdout.write(`\u2713 Installed skill   \u2192 ${skillDst}
`);
    process.stdout.write(`\u2713 Installed command \u2192 ${cmdDst}
`);
    process.stdout.write("\n");
    process.stdout.write("Next step \u2014 wire the native Claude Code worktree hooks.\n");
    process.stdout.write(`Add this block to ${join4(target, "settings.json")}:

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
import { simpleGit as simpleGit3 } from "simple-git";
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
  const git = dryRun ? null : simpleGit3(options.repoRoot);
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
import { createReadStream as createReadStream2, existsSync as existsSync8 } from "fs";
import { createInterface as createInterface2 } from "readline";
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
  if (!existsSync8(filePath)) return summary;
  const stream = createReadStream2(filePath, { encoding: "utf8" });
  const rl = createInterface2({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });
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
import { existsSync as existsSync9, readFileSync as readFileSync5 } from "fs";
import { simpleGit as simpleGit4 } from "simple-git";
async function readLiveDiff(agent) {
  if (!existsSync9(agent.path)) return "";
  try {
    return await simpleGit4(agent.path).raw(["diff", agent.baseRef]);
  } catch {
    return "";
  }
}
async function buildAgentReport(agent) {
  let rawDiff = "";
  let diffSource = "missing";
  if (agent.diffPath && existsSync9(agent.diffPath)) {
    const parsed = JSON.parse(readFileSync5(agent.diffPath, "utf8"));
    rawDiff = parsed.unified ?? "";
    diffSource = "stored";
  }
  if (rawDiff.length === 0) {
    const live = await readLiveDiff(agent);
    if (live.length > 0) {
      rawDiff = live;
      diffSource = "live";
    }
  }
  const diff = parseUnifiedDiff(rawDiff);
  const transcript = agent.transcriptPath ? await readTranscript(agent.transcriptPath) : emptySummary();
  return { agent, diff, transcript, rawDiff, diffSource };
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

// src/tui/lib/agent-label.ts
function agentLabel(agent) {
  const label = agent.displayLabel?.trim();
  return label && label.length > 0 ? label : agent.name;
}
var init_agent_label = __esm({
  "src/tui/lib/agent-label.ts"() {
    "use strict";
  }
});

// src/tui/tab-bar.tsx
import { Box as Box3, Text as Text3 } from "ink";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var TabBar;
var init_tab_bar = __esm({
  "src/tui/tab-bar.tsx"() {
    "use strict";
    init_agent_label();
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
          agentLabel(a.report.agent),
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
import { mkdirSync as mkdirSync8, writeFileSync as writeFileSync5 } from "fs";
import { dirname as dirname8, join as join5 } from "path";
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
    mkdirSync8(dirname8(diffPath), { recursive: true });
    writeFileSync5(
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
      path: join5(repoRoot, ".claude", "worktrees", "wisp-agentdiff", agent.name),
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

// src/doctor.ts
var doctor_exports = {};
__export(doctor_exports, {
  runDoctor: () => runDoctor
});
import { existsSync as existsSync10, readFileSync as readFileSync6, statSync as statSync2 } from "fs";
import { homedir as homedir2 } from "os";
import { dirname as dirname9, join as join6, resolve as resolve6 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
import { simpleGit as simpleGit5 } from "simple-git";
function tag(status) {
  switch (status) {
    case "ok":
      return `${GREEN}OK  ${RESET}`;
    case "warn":
      return `${YELLOW}WARN${RESET}`;
    case "fail":
      return `${RED}FAIL${RESET}`;
  }
}
async function runDoctor(repoRoot) {
  const checks = [];
  const root = resolve6(repoRoot);
  let gitRoot = null;
  try {
    const out = await simpleGit5(root).revparse(["--show-toplevel"]);
    gitRoot = out.trim();
    checks.push({
      label: "workspace is a git repo",
      status: "ok",
      detail: gitRoot
    });
  } catch {
    checks.push({
      label: "workspace is a git repo",
      status: "fail",
      detail: `no git repo at ${root}. WorktreeCreate hooks only fire in git workspaces \u2014 run \`git init\` here first.`
    });
  }
  const thisFile = fileURLToPath2(import.meta.url);
  const distDir = dirname9(thisFile);
  const distExists = existsSync10(join6(distDir, "index.js"));
  checks.push({
    label: "wisp-agentdiff binary present",
    status: distExists ? "ok" : "fail",
    detail: distExists ? join6(distDir, "index.js") : `expected at ${distDir}`
  });
  const pluginRootCandidate = resolve6(distDir, "..");
  const pluginManifest = join6(pluginRootCandidate, ".claude-plugin", "plugin.json");
  if (existsSync10(pluginManifest)) {
    let version = "unknown";
    try {
      version = JSON.parse(readFileSync6(pluginManifest, "utf8")).version ?? "unknown";
    } catch {
    }
    checks.push({
      label: "plugin manifest reachable",
      status: "ok",
      detail: `${pluginManifest} (v${version})`
    });
  } else {
    checks.push({
      label: "plugin manifest reachable",
      status: "warn",
      detail: `${pluginManifest} not found \u2014 running outside a /plugin install? That's fine for the npm-install path.`
    });
  }
  const statePath = stateFilePath(root);
  if (existsSync10(statePath)) {
    try {
      const state = JSON.parse(readFileSync6(statePath, "utf8"));
      const age = Date.now() - statSync2(statePath).mtimeMs;
      const ageStr = age < 6e4 ? `${Math.round(age / 1e3)}s ago` : `${Math.round(age / 6e4)}m ago`;
      checks.push({
        label: "state file present",
        status: "ok",
        detail: `${state.agents.length} agent(s) recorded \u2014 last modified ${ageStr}`
      });
    } catch (err) {
      checks.push({
        label: "state file present",
        status: "fail",
        detail: `state file at ${statePath} is unreadable: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  } else {
    checks.push({
      label: "state file present",
      status: "warn",
      detail: `${statePath} does not exist yet \u2014 no worktree subagent has run in this directory. Try dispatching the bundled \`wisp-self-test\` subagent to populate it.`
    });
  }
  const claudeRoot = process.env.CLAUDE_CONFIG_DIR ?? join6(homedir2(), ".claude");
  const skillCopy = join6(claudeRoot, "skills", "wisp-agentdiff", "SKILL.md");
  if (existsSync10(skillCopy)) {
    checks.push({
      label: "skill registered in ~/.claude",
      status: "ok",
      detail: skillCopy
    });
  } else {
    checks.push({
      label: "skill registered in ~/.claude",
      status: "warn",
      detail: `${skillCopy} not found \u2014 this is fine if you installed via /plugin install (auto-registered) but not via npm.`
    });
  }
  const banner = `${DIM}\u2500\u2500 wisp-agentdiff doctor \u2014 ${root}${RESET}`;
  process.stdout.write(`${banner}

`);
  let firstFail = -1;
  checks.forEach((c, i) => {
    process.stdout.write(`  ${tag(c.status)}  ${c.label}
        ${DIM}${c.detail}${RESET}
`);
    if (c.status === "fail" && firstFail < 0) firstFail = i;
  });
  process.stdout.write("\n");
  if (firstFail >= 0) {
    process.stdout.write(
      `${RED}One or more checks failed \u2014 fix the first FAIL row before running /review-agents.${RESET}
`
    );
    return 1;
  }
  const anyWarn = checks.some((c) => c.status === "warn");
  if (anyWarn) {
    process.stdout.write(
      `${YELLOW}All required checks passed; warnings above explain the empty-state behavior.${RESET}
`
    );
    return 0;
  }
  process.stdout.write(
    `${GREEN}All checks passed \u2014 plugin is wired correctly and state file has captured agents.${RESET}
`
  );
  return 0;
}
var GREEN, YELLOW, RED, DIM, RESET;
var init_doctor = __esm({
  "src/doctor.ts"() {
    "use strict";
    init_state();
    GREEN = "\x1B[32m";
    YELLOW = "\x1B[33m";
    RED = "\x1B[31m";
    DIM = "\x1B[2m";
    RESET = "\x1B[0m";
  }
});

// src/prune.ts
var prune_exports = {};
__export(prune_exports, {
  runPrune: () => runPrune
});
import { existsSync as existsSync11, readdirSync, realpathSync as realpathSync3, statSync as statSync3 } from "fs";
import { resolve as resolve7 } from "path";
import { simpleGit as simpleGit6 } from "simple-git";
function normalize(p) {
  const abs = resolve7(p);
  try {
    return realpathSync3.native ? realpathSync3.native(abs) : realpathSync3(abs);
  } catch {
    return abs;
  }
}
function scanFsWorktrees(basePath) {
  if (!existsSync11(basePath)) return [];
  let entries;
  try {
    entries = readdirSync(basePath);
  } catch {
    return [];
  }
  const result = [];
  for (const entry of entries) {
    const full = resolve7(basePath, entry);
    try {
      const st = statSync3(full);
      if (!st.isDirectory()) continue;
      result.push({ path: normalize(full), mtimeMs: st.mtimeMs });
    } catch {
    }
  }
  return result;
}
function ageHoursOf(iso, nowMs) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return (nowMs - t) / (1e3 * 60 * 60);
}
function pathExistsSafely(p) {
  try {
    return existsSync11(p);
  } catch {
    return false;
  }
}
async function runPrune(options) {
  const inputRoot = resolve7(options.repoRoot);
  const repoRoot = await resolveOuterRepoRoot(inputRoot);
  if (repoRoot !== inputRoot) {
    process.stderr.write(
      `wisp-agentdiff prune: invoked from inside a wisp-agentdiff worktree (${inputRoot}); retargeting to outer repo root ${repoRoot}
`
    );
    logHookEvent(repoRoot, "prune.retargeted", {
      message: `[v1.4] nested wisp-agentdiff worktree detected; retargeting state from ${inputRoot} to ${repoRoot}`,
      inputRoot,
      resolvedRoot: repoRoot
    });
  }
  const olderThanHours = options.olderThanHours ?? DEFAULT_OLDER_THAN_HOURS;
  const dryRun = options.dryRun === true;
  const all = options.all === true;
  const nowMs = Date.now();
  const state = loadState(repoRoot);
  const basePath = defaultBasePath(repoRoot);
  const fsList = scanFsWorktrees(basePath);
  const result = {
    scanned: { agents: state.agents.length, fsWorktrees: fsList.length },
    candidates: [],
    pruned: [],
    skipped: [],
    errors: []
  };
  const registeredPaths = /* @__PURE__ */ new Set();
  for (const a of state.agents) {
    if (a.path) registeredPaths.add(normalize(a.path));
  }
  const stateOrphans = [];
  const agedOut = [];
  const keptAgents = [];
  for (const agent of state.agents) {
    const onDisk = pathExistsSafely(agent.path);
    if (!onDisk) {
      stateOrphans.push(agent);
      result.candidates.push({
        kind: "state-orphan",
        agentId: agent.id,
        name: agent.name,
        path: agent.path,
        branch: agent.branch,
        reason: "agent recorded in state but worktree path missing on disk"
      });
      continue;
    }
    const age = ageHoursOf(agent.createdAt, nowMs);
    if (all || age >= olderThanHours) {
      agedOut.push(agent);
      result.candidates.push({
        kind: "aged-out",
        agentId: agent.id,
        name: agent.name,
        path: agent.path,
        branch: agent.branch,
        ageHours: age,
        reason: all ? "--all: ignore age cutoff" : `worktree older than ${olderThanHours}h (age ${age.toFixed(1)}h)`
      });
      continue;
    }
    keptAgents.push(agent);
  }
  const fsOrphans = [];
  for (const entry of fsList) {
    if (registeredPaths.has(entry.path)) continue;
    fsOrphans.push(entry);
    result.candidates.push({
      kind: "fs-orphan",
      path: entry.path,
      reason: "worktree directory not referenced by any state entry"
    });
  }
  if (dryRun) {
    result.skipped = [...result.candidates];
    logHookEvent(repoRoot, "prune.summary", {
      dryRun: true,
      scanned: result.scanned,
      candidates: result.candidates.length,
      stateOrphans: stateOrphans.length,
      fsOrphans: fsOrphans.length,
      agedOut: agedOut.length
    });
    return result;
  }
  const git = simpleGit6(repoRoot);
  const droppedAgentIds = /* @__PURE__ */ new Set();
  const removeOnDisk = async (item) => {
    try {
      await git.raw(["worktree", "remove", "--force", item.path]);
    } catch (err) {
      try {
        await git.raw(["worktree", "prune"]);
      } catch {
      }
      throw err;
    }
    if (item.branch) {
      try {
        await git.raw(["branch", "-D", item.branch]);
      } catch {
      }
    }
  };
  for (const agent of stateOrphans) {
    const item = {
      kind: "state-orphan",
      agentId: agent.id,
      name: agent.name,
      path: agent.path,
      branch: agent.branch,
      reason: "agent recorded in state but worktree path missing on disk"
    };
    if (agent.branch) {
      try {
        await git.raw(["branch", "-D", agent.branch]);
      } catch {
      }
    }
    droppedAgentIds.add(agent.id);
    result.pruned.push(item);
  }
  for (const orphan of fsOrphans) {
    const item = {
      kind: "fs-orphan",
      path: orphan.path,
      reason: "worktree directory not referenced by any state entry"
    };
    try {
      await git.raw(["worktree", "remove", "--force", orphan.path]);
      result.pruned.push(item);
    } catch (err) {
      result.errors.push({ item, message: err instanceof Error ? err.message : String(err) });
    }
  }
  for (const agent of agedOut) {
    const item = {
      kind: "aged-out",
      agentId: agent.id,
      name: agent.name,
      path: agent.path,
      branch: agent.branch,
      ageHours: ageHoursOf(agent.createdAt, nowMs),
      reason: `worktree older than ${olderThanHours}h`
    };
    try {
      await removeOnDisk(item);
      droppedAgentIds.add(agent.id);
      result.pruned.push(item);
    } catch (err) {
      result.errors.push({ item, message: err instanceof Error ? err.message : String(err) });
    }
  }
  if (droppedAgentIds.size > 0) {
    const nextState = {
      ...state,
      agents: state.agents.filter((a) => !droppedAgentIds.has(a.id))
    };
    saveState(repoRoot, nextState);
  }
  logHookEvent(repoRoot, "prune.summary", {
    dryRun: false,
    scanned: result.scanned,
    candidates: result.candidates.length,
    pruned: result.pruned.length,
    errors: result.errors.length,
    stateOrphans: stateOrphans.length,
    fsOrphans: fsOrphans.length,
    agedOut: agedOut.length
  });
  return result;
}
var DEFAULT_OLDER_THAN_HOURS;
var init_prune = __esm({
  "src/prune.ts"() {
    "use strict";
    init_debug_log();
    init_resolve_repo_root();
    init_state();
    init_worktree_manager();
    DEFAULT_OLDER_THAN_HOURS = 24 * 7;
  }
});

// src/wrap/pre-tool-use-hook.ts
var pre_tool_use_hook_exports = {};
__export(pre_tool_use_hook_exports, {
  handlePreToolUse: () => handlePreToolUse
});
function handlePreToolUse(payload, deps) {
  try {
    if (!payload || typeof payload !== "object") return;
    if (payload.tool_name !== "Task") return;
    const input = payload.tool_input;
    const subagentType = input?.subagent_type;
    if (typeof subagentType !== "string" || subagentType.length === 0) return;
    const now = deps.now ?? (() => /* @__PURE__ */ new Date());
    const description = typeof input?.description === "string" && input.description.length > 0 ? input.description : void 0;
    const task = {
      subagentType,
      ...description !== void 0 ? { description } : {},
      queuedAt: now().toISOString()
    };
    enqueueTask(deps.repoRoot, task);
    logHookEvent(deps.repoRoot, "pre-tool-use.queued", {
      subagentType,
      hasDescription: description !== void 0
    });
  } catch {
  }
}
var init_pre_tool_use_hook = __esm({
  "src/wrap/pre-tool-use-hook.ts"() {
    "use strict";
    init_debug_log();
    init_pending_tasks();
  }
});

// src/index.ts
import { readFileSync as readFileSync7 } from "fs";
import { dirname as dirname10, join as join7 } from "path";
import { fileURLToPath as fileURLToPath3 } from "url";
import { Command } from "commander";

// src/wrap/post-spawn-hook.ts
init_debug_log();
init_resolve_repo_root();
init_state();
init_worktree_manager();
import { existsSync as existsSync4, mkdirSync as mkdirSync4, writeFileSync as writeFileSync3 } from "fs";
import { dirname as dirname4 } from "path";
async function handleWorktreeRemove(payload, deps) {
  if (!payload.name) throw new Error("WorktreeRemove payload missing required `name`");
  const now = deps.now ?? (() => /* @__PURE__ */ new Date());
  const inputRoot = deps.repoRoot;
  const resolvedRoot = await resolveOuterRepoRoot(inputRoot);
  if (resolvedRoot !== inputRoot) {
    logHookEvent(resolvedRoot, "worktree-remove.retargeted", {
      message: `[v1.4] nested wisp-agentdiff worktree detected; retargeting state from ${inputRoot} to ${resolvedRoot}`,
      inputRoot,
      resolvedRoot
    });
  }
  const repoRoot = resolvedRoot;
  const manager = deps.manager ?? new WorktreeManager(repoRoot);
  let state = loadState(repoRoot);
  const agent = (payload.agentId ? state.agents.find((a) => a.id === payload.agentId) : void 0) ?? state.agents.find((a) => a.name === payload.name);
  if (!agent) {
    logHookEvent(repoRoot, "worktree-remove.no-agent", {
      name: payload.name,
      agentIdHint: payload.agentId ?? null,
      knownAgents: state.agents.map((a) => ({ id: a.id, name: a.name }))
    });
    throw new Error(`no recorded agent for worktree '${payload.name}'`);
  }
  const worktreeExists = existsSync4(agent.path);
  const commitSha = await manager.commitPending(agent.path, "wisp-agentdiff: capture subagent edits").catch((err) => {
    logHookEvent(repoRoot, "worktree-remove.commit-error", {
      agentId: agent.id,
      path: agent.path,
      error: err instanceof Error ? err.message : String(err)
    });
    return null;
  });
  const unified = await manager.diffAgainst(agent.branch, agent.baseRef);
  const nameStatus = await manager.diffNameStatus(agent.branch, agent.baseRef);
  const filesChanged = nameStatus.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
  logHookEvent(repoRoot, "worktree-remove.captured", {
    agentId: agent.id,
    name: agent.name,
    path: agent.path,
    worktreeExisted: worktreeExists,
    autoCommitSha: commitSha,
    filesChanged,
    diffEmpty: unified.length === 0,
    diffBytes: unified.length
  });
  const diffPath = diffStoragePath(repoRoot, agent.id);
  mkdirSync4(dirname4(diffPath), { recursive: true });
  const payloadOut = {
    agentId: agent.id,
    branch: agent.branch,
    baseRef: agent.baseRef,
    capturedAt: now().toISOString(),
    unified,
    nameStatus
  };
  writeFileSync3(diffPath, JSON.stringify(payloadOut, null, 2), "utf8");
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
  saveState(repoRoot, state);
  return { agentId: agent.id, removed, diffPath, filesChanged };
}

// src/wrap/pre-spawn-hook.ts
init_debug_log();
init_pending_tasks();
init_resolve_repo_root();
init_state();
import { mkdirSync as mkdirSync6 } from "fs";
import { dirname as dirname6 } from "path";

// src/wrap/transcript-correlator.ts
init_pending_tasks();
import { createReadStream, existsSync as existsSync6 } from "fs";
import { createInterface } from "readline";
async function ingestTranscriptTasks(repoRoot, transcriptPath, opts = {}) {
  if (!existsSync6(transcriptPath)) return 0;
  const now = opts.now ?? (() => /* @__PURE__ */ new Date());
  const state = loadPending(repoRoot);
  const stream = createReadStream(transcriptPath, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });
  let added = 0;
  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (!event || typeof event !== "object") continue;
    const e = event;
    if (e.type !== "assistant") continue;
    const content = e.message?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const p = part;
      if (p.type !== "tool_use" || p.name !== "Task") continue;
      const id = typeof p.id === "string" ? p.id : "";
      const subagentType = typeof p.input?.subagent_type === "string" ? p.input.subagent_type : "";
      if (!id || !subagentType) continue;
      if (hasSeenToolUseId(state, id)) continue;
      const task = {
        subagentType,
        ...typeof p.input?.description === "string" ? { description: p.input.description } : {},
        toolUseId: id,
        queuedAt: now().toISOString()
      };
      state.tasks.push(task);
      added++;
    }
  }
  if (added > 0) savePending(repoRoot, state);
  return added;
}

// src/wrap/pre-spawn-hook.ts
init_worktree_manager();
async function handleWorktreeCreate(payload, deps) {
  if (!payload.name) throw new Error("WorktreeCreate payload missing required `name`");
  const now = deps.now ?? (() => /* @__PURE__ */ new Date());
  const inputRoot = deps.repoRoot;
  const cwdHint = payload.cwd ?? inputRoot;
  const resolvedRoot = await resolveOuterRepoRoot(cwdHint);
  if (resolvedRoot !== inputRoot) {
    logHookEvent(resolvedRoot, "worktree-create.retargeted", {
      message: `[v1.4] nested wisp-agentdiff worktree detected; retargeting state from ${inputRoot} to ${resolvedRoot}`,
      inputRoot,
      cwdHint,
      resolvedRoot
    });
  }
  const repoRoot = resolvedRoot;
  const manager = deps.manager ?? new WorktreeManager(repoRoot);
  const created = await manager.create({
    name: payload.name,
    ...payload.baseRef !== void 0 ? { baseRef: payload.baseRef } : {}
  });
  const agentId = payload.agentId ?? `agent-${created.name}-${now().getTime().toString(36)}`;
  mkdirSync6(dirname6(created.path), { recursive: true });
  if (payload.transcript_path) {
    try {
      const added = await ingestTranscriptTasks(repoRoot, payload.transcript_path);
      logHookEvent(repoRoot, "transcript.ingested", {
        added,
        transcript: payload.transcript_path
      });
    } catch (err) {
      logHookEvent(repoRoot, "transcript.ingest-error", {
        transcript: payload.transcript_path,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  const pending = dequeueOldestUnstale(repoRoot);
  const displayLabel = pending?.subagentType;
  const record = {
    id: agentId,
    name: created.name,
    path: created.path,
    branch: created.branch,
    baseRef: created.baseRef,
    createdAt: now().toISOString(),
    status: "running",
    ...displayLabel !== void 0 ? { displayLabel } : {}
  };
  let state = loadState(repoRoot);
  state = upsertAgent(state, record);
  saveState(repoRoot, state);
  logHookEvent(repoRoot, "worktree-create.label-correlated", {
    matched: displayLabel !== void 0,
    ...displayLabel !== void 0 ? { displayLabel } : {}
  });
  logHookEvent(repoRoot, "worktree-create.registered", {
    agentId,
    name: created.name,
    path: created.path,
    branch: created.branch,
    baseRef: created.baseRef,
    payloadKeys: Object.keys(payload)
  });
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
program.command("doctor").description("Diagnose plugin install + hook wiring + state \u2014 prints OK / WARN / FAIL per check").option("--repo <dir>", "repository root", process.cwd()).action(async (opts) => {
  const { runDoctor: runDoctor2 } = await Promise.resolve().then(() => (init_doctor(), doctor_exports));
  const code = await runDoctor2(opts.repo);
  process.exit(code);
});
program.command("prune").description("Garbage-collect orphaned worktrees + wisp-agentdiff/agent-* branches").option("--repo <dir>", "repository root", process.cwd()).option(
  "--older-than-hours <hours>",
  "only prune entries older than N hours (default 168)",
  "168"
).option("--all", "ignore age cutoff and prune everything captured").option("--dry-run", "print the plan, do not execute").action(
  async (opts) => {
    const { runPrune: runPrune2 } = await Promise.resolve().then(() => (init_prune(), prune_exports));
    const result = await runPrune2({
      repoRoot: opts.repo,
      olderThanHours: Number(opts.olderThanHours),
      all: opts.all ?? false,
      dryRun: opts.dryRun ?? false
    });
    const counts = { "state-orphan": 0, "fs-orphan": 0, "aged-out": 0 };
    for (const c of result.candidates) counts[c.kind]++;
    process.stdout.write(
      `wisp-agentdiff prune \u2014 scanned ${result.scanned.agents} agents, ${result.scanned.fsWorktrees} fs worktrees
`
    );
    process.stdout.write(
      `  ${result.candidates.length} candidates: ${counts["state-orphan"]} state-orphan, ${counts["fs-orphan"]} fs-orphan, ${counts["aged-out"]} aged-out
`
    );
    if (opts.dryRun) {
      for (const c of result.candidates) {
        const label = c.name ?? c.agentId ?? c.path;
        process.stdout.write(`  [dry-run] ${c.kind}  ${label}  \u2014 ${c.reason}
`);
      }
    } else {
      const prunedSet = new Set(result.pruned);
      for (const c of result.candidates) {
        const label = c.name ?? c.agentId ?? c.path;
        const err = result.errors.find((e) => e.item === c);
        if (err) {
          process.stdout.write(`  FAIL  ${c.kind}  ${label}  \u2014 ${err.message}
`);
        } else if (prunedSet.has(c)) {
          process.stdout.write(`  OK    ${c.kind}  ${label}
`);
        }
      }
      process.stdout.write(
        `pruned ${result.pruned.length} of ${result.candidates.length}, errors ${result.errors.length}
`
      );
    }
    process.exit(0);
  }
);
var hook = program.command("hook").description("Native Claude Code worktree hook entry points (stdin JSON \u2192 stdout JSON)");
hook.command("worktree-create").description("Handle WorktreeCreate hook (stdin payload, prints path to stdout)").option("--repo <dir>", "repository root", process.cwd()).action(async (opts) => {
  const payload = readStdinJson();
  const result = await handleWorktreeCreate(payload, { repoRoot: opts.repo });
  process.stdout.write(`${result.path}
`);
  if (process.env.WISP_DEBUG) process.stderr.write(`${JSON.stringify(result)}
`);
});
hook.command("pre-tool-use").description(
  "Handle PreToolUse hook for matcher 'Task' \u2014 records subagent_type for WorktreeCreate correlation"
).option("--repo <dir>", "repository root", process.cwd()).action(async (opts) => {
  const { handlePreToolUse: handlePreToolUse2 } = await Promise.resolve().then(() => (init_pre_tool_use_hook(), pre_tool_use_hook_exports));
  let payload;
  try {
    payload = readStdinJson();
  } catch {
    return;
  }
  handlePreToolUse2(payload, { repoRoot: opts.repo });
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
  const buf = readFileSync7(0);
  if (buf.length > MAX_STDIN_BYTES) {
    throw new Error(`stdin payload exceeds ${MAX_STDIN_BYTES} bytes`);
  }
  const raw = buf.toString("utf8").trim();
  if (!raw) throw new Error("expected JSON payload on stdin");
  return JSON.parse(raw);
}
function readPackageVersion() {
  try {
    const thisFile = fileURLToPath3(import.meta.url);
    const pkgPath = join7(dirname10(thisFile), "..", "package.json");
    const pkg = JSON.parse(readFileSync7(pkgPath, "utf8"));
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
# Roadmap

`wisp-agentdiff` v1.0 covers the core loop: worktree hook → diff capture →
tabbed TUI review → conflict-gated merge. Issues and PRs welcome on
everything below.

## Shipping in v1.0–v1.4

- [x] Native `WorktreeCreate` / `WorktreeRemove` hook handlers
- [x] Per-agent diff capture with structured `name-status` + full unified diff
- [x] JSONL transcript reader (tolerant of schema variation across Claude Code versions)
- [x] Ink TUI: tabbed per-agent view, decision glyphs, scroll, hotkeys
- [x] Cross-agent file-conflict detector
- [x] Sequential `git merge --no-ff` approver with abort-on-conflict
- [x] `npx wisp-agentdiff install` — drops skill + slash command into `~/.claude/`
- [x] CI matrix: Linux / macOS / Windows × Node 20 / 22
- [x] Claude Code `/plugin install` path (v1.1.0+) with bundled `dist/`, `wisp-self-test` canary, and `doctor` subcommand
- [x] Hook diagnostic log at `.claude/wisp-agentdiff/debug.log` (v1.1.3)
- [x] `PreToolUse: Task` correlation plumbed (v1.2.0) — the code path
  works in tests, but **end-to-end verification on Claude Code v2 shows
  the `PreToolUse: Task` hook does not actually fire** for plugin-loaded
  hooks, so the displayLabel field is never populated in practice. The
  pending-tasks store + correlation reducer stay in place as scaffolding
  for v1.3, when we will derive subagent_type from the
  `transcript_path` field Claude Code does pass into the WorktreeCreate
  payload.
- [x] Live worktree diff at review time (v1.2.1) — `buildAgentReport`
  now falls back to `git diff <baseRef>` against the still-existing
  worktree when the cached diff JSON is missing or empty. This is the
  typical path because Claude Code persists subagent worktrees until
  session-end, so `WorktreeRemove` rarely fires during normal review.
- [x] `transcript_path`-based subagent_type extraction (v1.3.0) — the
  TUI now labels agents by their real subagent_type (e.g.
  `wisp-self-test`) by parsing the `transcript_path` Claude Code passes
  into the WorktreeCreate payload and extracting the most recent `Task`
  tool invocation. Replaces the unfired-PreToolUse:Task scaffolding.
- [x] `wisp-agentdiff prune` command (v1.3.0) — garbage-collects
  orphaned `wisp-agentdiff/agent-*` branches and
  `.claude/worktrees/wisp-agentdiff/<name>/` directories accumulated
  across sessions. Supports `--dry-run`, `--older-than-hours <N>`
  (default 168), and `--all`.
- [x] TUI tab labels prefer displayLabel over hex-id name (v1.4.0) —
  fixes the "wisp-self-test shows as agent-a4925f3·" bug. The
  transcript correlator populated displayLabel since v1.3, but the
  TUI rendered name everywhere. Centralized via `agentLabel()`
  helper; underlying name still used for keys, branches, and file
  paths.
- [x] Outer-repo resolution for nested wisp-agentdiff worktrees
  (v1.4.0) — when a subagent is dispatched while the parent
  context's cwd is already inside an existing
  `.claude/worktrees/wisp-agentdiff/agent-<hex>/` worktree, the
  WorktreeCreate hook now walks up to the outermost non-wisp git
  root before creating the new worktree directory and writing state.
  Previously the new worktree was created inside the old one and
  state landed in an inner state file invisible to the outer
  `/review-agents` invocation.

## Known limitations

- **Agent status stays `running` indefinitely; cached diffs never write.**
  Claude Code does not fire `WorktreeRemove` on subagent completion
  (worktrees persist until session-end or `claude --remove-worktree`).
  v1.2.1 sidesteps this by computing the diff live from the worktree
  at review time. The `commitPending` + cached-diff path in
  `WorktreeRemove` remains as a fallback for the orphan-sweep case.
  v1.4 specifically addresses the nested-worktree variant of this
  problem — state is now always written to the outermost git root.

## Probably v1.4+

- [ ] Side-by-side conflict diff (currently stacked vertically)
- [ ] Per-agent transcript pane (currently surfaced as a header summary)
- [ ] Lazy-render large diffs (deferred parsing for hunks below the fold)
- [ ] Color-blind theme switch

## Open questions

- Whether to support non-`--no-ff` merge strategies in the TUI itself (the
  approver supports `ff-only` and `squash` via API; the TUI hard-codes
  `--no-ff` for now).
- Whether to expose token / tool-call telemetry as a dedicated pane vs. the
  current single-line header.
- Whether to capture `worktreeinclude` semantics in the diff view (env
  files are currently shown if subagents touch them).

## Not in scope

- PR creation, GitHub integration — out of scope for v1; use `gh pr create`
  with the merged HEAD.
- Interactive in-TUI conflict resolution. Revert one side, re-approve, retry.
- Non-git VCS (Mercurial / `jj`).
- A daemon / watcher process. The native hooks run when Claude Code
  triggers them; we don't poll.

# Roadmap

`wisp-agentdiff` v1.0 covers the core loop: worktree hook → diff capture →
tabbed TUI review → conflict-gated merge. Issues and PRs welcome on
everything below.

## Shipping in v1.0–v1.2

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

## Known limitations

- **Agent label in the TUI is Claude Code's hex worktree id, not the
  subagent_type.** Confirmed via debug.log: Claude Code v2 does not
  currently invoke plugin-defined `PreToolUse: Task` hooks, so the
  correlation buffer stays empty and `displayLabel` is never set.
  v1.3 will switch to parsing the `transcript_path` Claude Code does
  pass into the WorktreeCreate payload and extracting subagent_type
  from the most recent `Task` tool invocation in that transcript.

- **Agent status stays `running` indefinitely; cached diffs never write.**
  Claude Code does not fire `WorktreeRemove` on subagent completion
  (worktrees persist until session-end or `claude --remove-worktree`).
  v1.2.1 sidesteps this by computing the diff live from the worktree
  at review time. The `commitPending` + cached-diff path in
  `WorktreeRemove` remains as a fallback for the orphan-sweep case.

- **Worktree branches accumulate across sessions.** Since
  `WorktreeRemove` rarely fires, `wisp-agentdiff/agent-*` branches and
  the `.claude/worktrees/wisp-agentdiff/` subdirectories grow over time.
  v1.3 will add `wisp-agentdiff prune` to garbage-collect.

## Probably v1.3+

- [ ] `transcript_path`-based subagent_type extraction → real
  `displayLabel` (replaces the unfired PreToolUse:Task scaffolding)
- [ ] `wisp-agentdiff prune` to garbage-collect orphaned agent branches
  and `.claude/worktrees/wisp-agentdiff/<name>/` dirs left by
  unfired WorktreeRemove
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

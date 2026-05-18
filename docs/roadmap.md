# Roadmap

`wisp-agentdiff` v1.0 covers the core loop: worktree hook → diff capture →
tabbed TUI review → conflict-gated merge. Issues and PRs welcome on
everything below.

## Shipping in v1.0

- [x] Native `WorktreeCreate` / `WorktreeRemove` hook handlers
- [x] Per-agent diff capture with structured `name-status` + full unified diff
- [x] JSONL transcript reader (tolerant of schema variation across Claude Code versions)
- [x] Ink TUI: tabbed per-agent view, decision glyphs, scroll, hotkeys
- [x] Cross-agent file-conflict detector
- [x] Sequential `git merge --no-ff` approver with abort-on-conflict
- [x] `npx wisp-agentdiff install` — drops skill + slash command into `~/.claude/`
- [x] CI matrix: Linux / macOS / Windows × Node 20 / 22

## Probably v1.1

- [ ] Side-by-side conflict diff (currently stacked vertically)
- [ ] Per-agent transcript pane (currently surfaced as a header summary)
- [ ] `wisp-agentdiff prune` to garbage-collect orphaned agent branches
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

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
- [x] `PreToolUse: Task` correlation so the TUI shows the real subagent_type
  label (e.g. `wisp-self-test`) instead of Claude Code's internal hex
  worktree id (v1.2.0)

## Known limitations

- **Diff is empty when a subagent doesn't commit its own edits.** The
  `WorktreeRemove` handler runs `commitPending` (i.e. `git add -A && git
  commit`) on the worktree before computing the diff, but Claude Code may
  remove the worktree directory before the hook fires, in which case there
  is nothing to commit against. The shipped `wisp-self-test` canary
  explicitly commits inside the worktree as a belt-and-braces — real
  subagents that only mutate the working tree without committing may
  produce empty diffs. v1.2 will inspect file system state pre-removal
  and capture a working-tree snapshot as a fallback.

## Probably v1.3+

- [ ] Working-tree snapshot fallback when `WorktreeRemove` finds an
  uncommitted-or-already-cleaned worktree
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

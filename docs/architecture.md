# wisp-agentdiff — Architecture

## What problem it solves

Claude Code can spawn multiple subagents concurrently. With native worktree
isolation (`isolation: worktree` in subagent frontmatter), each subagent works
in its own branch. But there is no built-in way to review per-agent changes
before merging — cleanup is binary (keep all / discard all).

`wisp-agentdiff` sits on top of the native worktree primitive and adds the
review layer: tabbed TUI, per-agent token + tool-call telemetry, cross-agent
conflict detection, single-key approve / revert / merge.

## Pipeline

```
                    ┌─────────────────────────┐
 user message  ──→  │ Claude Code main session│
                    └────────────┬────────────┘
                                 │ Task(subagent A,B,C)
                                 ▼
                    ┌─────────────────────────┐
                    │ Native WorktreeCreate   │   ←─── settings.json hook
                    │   hook (claude code)    │       wisp-agentdiff hook
                    └────────────┬────────────┘       worktree-create
                                 │
                                 ▼
              .claude/worktrees/wisp-agentdiff/<name>/   (one per subagent)
              .claude/wisp-agentdiff-state.json          (agent registry)
                                 │
                                 │   subagents edit + emit JSONL transcripts
                                 ▼
                    ┌─────────────────────────┐
                    │ Native WorktreeRemove   │   ←─── hook on completion
                    │   hook (claude code)    │       wisp-agentdiff hook
                    └────────────┬────────────┘       worktree-remove
                                 │
                                 │   captures git diff main…branch
                                 │   captures name-status, file counts
                                 ▼
              .claude/wisp-agentdiff/diffs/<agentId>.json
                                 │
              user types /review-agents (or skill auto-triggers)
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │ Ink TUI (wisp-agentdiff │
                    │   review)               │
                    │ ─ tab-bar per agent     │
                    │ ─ diff pane (memoized)  │
                    │ ─ conflict view         │
                    │ ─ merge-status line     │
                    └────────────┬────────────┘
                                 │ [m]
                                 ▼
                    ┌─────────────────────────┐
                    │ approver (simple-git)   │
                    │ ─ gates on cross-agent  │
                    │   approved conflicts    │
                    │ ─ git merge --no-ff per │
                    │   approved branch       │
                    │ ─ aborts on runtime     │
                    │   conflict, halts queue │
                    └─────────────────────────┘
```

## Module map

| Module | Responsibility |
|--------|----------------|
| `wrap/worktree-manager.ts` | thin `git worktree` API + path normalization |
| `wrap/pre-spawn-hook.ts` | handles `WorktreeCreate` — registers agent, returns dir |
| `wrap/post-spawn-hook.ts` | handles `WorktreeRemove` — commits, captures diff, removes |
| `wrap/state.ts` | reads / writes `.claude/wisp-agentdiff-state.json` |
| `collect/diff-parser.ts` | parses unified diff into per-file hunks |
| `collect/jsonl-reader.ts` | tolerant transcript reader — schema may shift across CC versions |
| `collect/token-tracker.ts` | combines diff + transcript into one `AgentReport` |
| `tui/app.tsx` | top-level Ink component — pane state, merge wiring |
| `tui/tab-bar.tsx` | header tab bar with decision glyphs |
| `tui/diff-view.tsx` | windowed scroll buffer over flattened hunks |
| `tui/conflict-view.tsx` | side-by-side participants for an overlapping file |
| `tui/hotkeys.ts` | pure reducer — unit-testable without Ink |
| `merge/conflict-detector.ts` | finds files touched by 2+ agents |
| `merge/approver.ts` | sequential `git merge --no-ff` with gating + abort |
| `install.ts` | copies skill + slash command into `~/.claude/` |

## Design choices

- **Hook into native worktrees, don't re-implement them.** The pre/post-spawn
  hooks consume Claude Code's `WorktreeCreate` / `WorktreeRemove` events
  instead of calling `git worktree add` ourselves. This means we survive
  Claude Code worktree-feature evolution and respect `.worktreeinclude`.
- **Reducer-based hotkey core.** All key handling lives in a pure reducer
  (`tui/hotkeys.ts`) so we can unit-test every transition without rendering
  Ink. The App is then a thin wiring layer.
- **State on disk, not in memory.** Agents survive across `wisp-agentdiff
  review` invocations because `.claude/wisp-agentdiff-state.json` is the
  source of truth, not a daemon.
- **Gating, not auto-resolution.** When two approved agents touch the same
  file, we refuse to merge and force the user to revert one side. No silent
  conflict markers, no theirs/ours guessing.
- **Three colors only.** demo GIFs compress better with a limited palette.

## What's intentionally NOT here

- No watcher process. The native hooks run when Claude Code triggers them; we
  don't poll.
- No PR creation, no GitHub integration. Out of scope for v1.
- No interactive conflict resolution UI. Revert one side, re-approve, retry.
- No support for non-git VCS. Mercurial / jj users aren't the target.

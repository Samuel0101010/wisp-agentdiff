# Repo guide for Claude Code

This file is read by Claude Code when working inside this repo. It captures
the few conventions that aren't obvious from the source.

## What it is

`wisp-agentdiff` is a TypeScript CLI + Ink TUI that consumes Claude Code's
native `WorktreeCreate` / `WorktreeRemove` hooks, captures the diff and
transcript of every subagent worktree, and lets you approve, revert, or
merge each one independently from a tabbed terminal UI.

Full architecture: [`docs/architecture.md`](docs/architecture.md).
Roadmap: [`docs/roadmap.md`](docs/roadmap.md).

## Module map

| Module | Responsibility |
|--------|----------------|
| `src/wrap/` | Worktree manager, pre/post-spawn hook handlers, state file |
| `src/collect/` | Unified-diff parser, JSONL transcript reader, per-agent report aggregation |
| `src/tui/` | Ink components, pure-reducer hotkey core (`hotkeys.ts`), run loop |
| `src/merge/` | Cross-agent conflict detector, sequential approver |
| `src/install.ts` | `npx wisp-agentdiff install` — deploys SKILL + slash command into `~/.claude/` |
| `templates/` | Shipped with the npm package: `skill.md`, `review-agents.md`, `hooks-snippet.json` |
| `tests/` | Vitest suite — temp git repos for the worktree + merge integration tests |

## Build commands

```bash
npm install
npm run check          # lint + typecheck + test + build (CI-equivalent)
npm run test:watch     # iterating on a single module
npm run dev            # tsup watch build
```

The CLI binary is `dist/index.js` (single ESM file, ~38 KiB). Smoke-test it
without installing globally:

```bash
node dist/index.js review --repo .
echo '{"name":"demo"}' | node dist/index.js hook worktree-create --repo .
```

## Conventions

- **Edits stay surgical.** Match the existing style; no opportunistic
  refactors in unrelated files. Diff-test every change against the stated
  task.
- **Tests live in `tests/`**, not co-located. Integration tests that need a
  real git repo use `tests/helpers/temp-repo.ts`.
- **Path normalization.** Windows paths must round-trip through
  `realpathSync.native` before string comparison — temp directories can
  produce short-path forms that don't match what you handed to `git`.
- **Hotkey changes go in the reducer, not the App.** `tui/hotkeys.ts` is
  pure and unit-tested. The App just dispatches.
- **No new dependencies without a clear case.** The intentional dependency
  list is short: `commander`, `ink`, `react`, `simple-git`.

## When working with subagents

If you spawn parallel subagents in this repo, give them names and pass
explicit hand-off targets — coordination by name is more reliable than
polling shared state.

```
Agent({ subagent_type: "researcher", name: "researcher",
        prompt: "Investigate X. Hand findings to 'coder'.",
        run_in_background: true })
Agent({ subagent_type: "coder", name: "coder",
        prompt: "Wait for 'researcher'. Implement, hand to 'tester'.",
        run_in_background: true })
```

## Quality gates

A change is ready to commit when:

- `npm run lint` exits clean (one biome warning on a non-null assertion is acceptable).
- `npm run typecheck` is silent.
- `npm run test` is fully green.
- `npm run build` produces a `dist/index.js` that runs `--help` without error.

CI replays the same four steps across Linux / macOS / Windows on Node 20 + 22.

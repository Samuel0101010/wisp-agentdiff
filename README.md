# wisp-agentdiff

> Per-agent diffs for Claude Code parallel subagent workflows.

<!-- demo-gif-placeholder: docs/demo.gif (autoplay, <5MB) — generated via `vhs scripts/demo.tape` before public release -->

**Status:** Pre-release (private repo until v1.0.0). [Build roadmap →](./CLAUDE.md)

When Claude Code spawns multiple subagents in parallel under isolated
worktrees, you currently only get an all-or-nothing cleanup decision.
`wisp-agentdiff` adds the review layer: a tabbed TUI with per-agent diff,
token usage, tool-call list, cross-agent conflict detection, and single-key
approve / revert / merge.

## Install

```bash
npx wisp-agentdiff install
```

That copies the `wisp-agentdiff` skill and `/review-agents` slash command
into `~/.claude/` and prints a one-time `settings.json` hook snippet you add
to wire the native `WorktreeCreate` / `WorktreeRemove` events.

## Use

After a Claude Code session spawns 2+ subagents with `isolation: worktree`:

```bash
wisp-agentdiff review
```

— or say "review the agents" / "show me what each agent did" in chat and the
skill triggers it for you, or type `/review-agents`.

### Hotkeys

| Key | Action |
|-----|--------|
| `a` | approve active agent (auto-advances) |
| `r` | revert active agent (auto-advances) |
| `n` / `p` | next / previous agent |
| `c` | toggle conflict view |
| `m` | merge all approved agents into HEAD |
| `j` / `k` | scroll diff |
| `q` | quit |

### Conflict gating

If two approved agents touch the same file, the merge step refuses and asks
you to revert one side first. No silent conflict markers, no `theirs` /
`ours` guessing.

## How it works

```
Claude Code subagent ─► WorktreeCreate hook ─► wisp-agentdiff records agent
                                   │
                                   ▼
                       isolated git worktree
                                   │
                Subagent edits, transcript JSONL captured
                                   │
                                   ▼
            WorktreeRemove hook ─► capture diff + remove worktree
                                   │
                                   ▼
              wisp-agentdiff review ─► tabbed TUI → [m] merges approved
```

Full architecture: [docs/architecture.md](./docs/architecture.md).

## Differentiator

`tazuna`, `plural`, and `cwt` are worktree orchestrators — they spawn
isolated sessions but treat the diff as a one-branch afterthought. Native
Claude Code worktrees give you the isolation primitive but stop short of any
review surface. `wisp-agentdiff` owns the review layer: aggregated TUI,
per-agent telemetry, cross-agent conflict detection, approve/revert/merge.

## Develop

```bash
npm install
npm run check          # lint + typecheck + test + build
npm run dev            # watch build
npm run test:watch     # watch tests
```

## License

MIT.

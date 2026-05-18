# Launch checklist — wisp-agentdiff v1.0.0

## Pre-flight

- [ ] All Phase 0–8 boxes checked in `CLAUDE.md`
- [ ] `npm run check` passes locally on Windows + macOS + Linux
- [ ] CI green on `main` (Node 20 + 22 matrix)
- [ ] `docs/demo.gif` exists, <5 MB, autoplays
- [ ] README hero block has the GIF in the first 200 vertical pixels
- [ ] `npm pack` output inspected — `dist/`, `templates/`, `README.md`, `LICENSE` only

## Repo flip

```
gh repo edit --visibility public
gh release create v1.0.0 \
  --title "v1.0.0 — Per-agent diffs for Claude Code parallel subagents" \
  --notes-file docs/launch-checklist.md
npm publish --access public
```

## HN Show-post

**Title:** `Show HN: Per-agent diffs for Claude Code parallel subagents`

**Time:** Tuesday 8:00 AM EST.

**Body draft:**

> Hey HN — Claude Code can now spawn multiple subagents in parallel under
> isolated git worktrees. Great for fan-out work; bad when one agent goes
> rogue and you only get an "approve everything or nothing" choice at the
> end.
>
> I built **wisp-agentdiff**, a TUI that hooks into Claude Code's native
> `WorktreeCreate` / `WorktreeRemove` events, captures each subagent's
> diff + token + tool-call telemetry, and gives you tabbed review with
> single-key approve / revert / merge.
>
> Demo: <link to GIF>
> Install: `npx wisp-agentdiff install`
> Source: <github URL>
> License: MIT, TypeScript / Ink.
>
> Happy to answer questions on the worktree-hook design or why I went with
> a pure-reducer hotkey core.

## Twitter / X thread

**Hook tweet (with GIF):**

> 5 Claude subagents ran in parallel. One went rogue. I needed a way to
> approve or reject each one independently. So I built wisp-agentdiff.
>
> Single-key per-agent diff review. MIT. Open source.
> <GIF>

**Tweet 2:**

> It hooks into Claude Code's native worktree isolation — each subagent
> already gets its own branch. wisp-agentdiff captures the diff +
> transcript on completion and opens a tabbed TUI with per-agent token
> usage and cross-agent file conflict detection.

**Tweet 3:**

> Hotkeys: `a` approve, `r` revert, `n`/`p` next/prev, `c` conflicts,
> `m` merge approved. Conflict view refuses to merge when 2+ approved
> agents touched the same file — you revert one side first.

**Tweet 4:**

> npx wisp-agentdiff install
> <repo link>

## Submissions

- [ ] `awesome-claude-code` PR
- [ ] `claudepluginhub.com`
- [ ] Anthropic Skill marketplace (if open)
- [ ] r/ClaudeAI weekly thread
- [ ] dev.to long-form post linking the HN thread once live

## Watch

- [ ] HN comments — first hour matters; reply to every thoughtful question
- [ ] GH issues — pin a known-issues note if Windows ANSI quirks surface
- [ ] Mention `[email protected]` 5-minute cache when discussing perf

---
name: wisp-agentdiff
description: Use when the user asks to "review the agents", "review the subagents", "show me what each agent did", "show the per-agent diffs", "show me each subagent's changes", "open the agent review", "diff per agent", or invokes the slash command `/review-agents`. Triggers proactively after a Task tool call that spawned 2+ subagents has completed — opens the per-agent diff TUI so the user can approve / revert each subagent independently before anything lands in the working tree.
---

# wisp-agentdiff

You are reviewing the output of Claude Code subagents that ran in parallel under isolated git worktrees.

## What this skill does

`wisp-agentdiff` records every subagent worktree the host Claude session creates (via the native `WorktreeCreate` / `WorktreeRemove` hooks), captures the diff and JSONL transcript of each, then opens a tabbed TUI with one pane per agent. Hotkeys: `a` approve · `r` revert · `n`/`p` next/prev · `c` conflict view · `m` merge approved · `j`/`k` scroll · `q` quit.

## When to invoke

Trigger this skill when the user says any of:
- "review the agents" / "review the subagents"
- "show me what each agent did"
- "show me each subagent's changes" / "show the per-agent diffs"
- "open the agent review" / "diff per agent"
- "/review-agents"

Also trigger proactively after a multi-subagent Task batch finishes — but only if at least two subagents were spawned and at least one captured worktree exists in `.claude/wisp-agentdiff-state.json`.

## How to invoke

Run `wisp-agentdiff review` in the current repo. The TUI loads agents from `.claude/wisp-agentdiff-state.json` and their diffs from `.claude/wisp-agentdiff/diffs/`.

```
wisp-agentdiff review
```

If the user has not installed wisp-agentdiff yet:

```
npx wisp-agentdiff install
```

## Conflicts

If two approved agents touch the same file, the merge step refuses and surfaces the conflict via `[c]` — the user must revert one side before re-attempting `[m]`. Don't try to bypass this.

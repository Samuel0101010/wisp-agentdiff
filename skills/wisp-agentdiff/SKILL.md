---
name: wisp-agentdiff
description: Use when the user asks to "review the agents", "review the subagents", "show me what each agent did", "show the per-agent diffs", "show me each subagent's changes", "open the agent review", "diff per agent", invokes the slash command `/review-agents`, or asks to "test wisp-agentdiff", "verify wisp-agentdiff", "check if wisp-agentdiff is working", "run wisp-agentdiff doctor", "prune wisp-agentdiff", "clean up wisp-agentdiff", or "garbage collect wisp-agentdiff worktrees". Triggers proactively after a Task tool call that spawned 2+ subagents with isolation:worktree has completed — opens the per-agent diff TUI so the user can approve / revert each subagent independently before anything lands in the working tree.
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

Also trigger proactively after a multi-subagent Task batch finishes — but only if at least two subagents were spawned with `isolation: worktree` and at least one captured worktree exists in `.claude/wisp-agentdiff-state.json`.

## How to invoke (plugin install)

```
node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" review --repo .
```

## How to invoke (npm install)

```
wisp-agentdiff review
```

The TUI loads agents from `.claude/wisp-agentdiff-state.json` and their diffs from `.claude/wisp-agentdiff/diffs/`. The TUI requires a real TTY — if you launch it inside Claude Code's Bash tool you'll see a "Raw mode is not supported" error; in that case advise the user to run the command in their own terminal.

## Verifying the install

If the state file is empty after the user expected to see diffs, run the diagnostic first:

```
node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" doctor --repo .
```

It prints OK / WARN / FAIL per check (git repo, binary reachable, state file age + agent count, skill registered).

If `doctor` confirms the wiring is correct but no agents are recorded, dispatch the bundled canary subagent to fire the hooks once and confirm capture:

```
Task(subagent_type: "wisp-self-test", description: "verify wisp-agentdiff hooks fire", prompt: "go")
```

Then `/review-agents` should show one agent labelled `wisp-self-test` with a single-line diff.

## Pruning

When the user asks to clean up, prune, or garbage-collect accumulated wisp-agentdiff worktrees and `wisp-agentdiff/agent-*` branches, run `wisp-agentdiff prune` (or `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" prune` for the plugin path). Use `--dry-run` first to preview, `--older-than-hours <N>` (default 168) to bound by age, or `--all` to prune everything captured.

## Conflicts

If two approved agents touch the same file, the merge step refuses and surfaces the conflict via `[c]` — the user must revert one side before re-attempting `[m]`. Don't try to bypass this.

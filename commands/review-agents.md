---
description: Open the wisp-agentdiff TUI to review per-agent diffs of the current session
allowed-tools: Bash(node *), Bash(wisp-agentdiff *)
---

Run the wisp-agentdiff review TUI in the current working directory.

Preferred (plugin-bundled binary, no PATH or npm install required):

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" review --repo .
```

Fallback (when the user installed via `npm i -g wisp-agentdiff` instead):

```bash
wisp-agentdiff review
```

The TUI lists every subagent the current Claude Code session recorded, with per-agent diff, token + tool-call summary, and cross-agent conflict detection.

Hotkeys: `a` approve · `r` revert · `n`/`p` next/prev agent · `c` toggle conflict view · `m` merge approved · `j`/`k` scroll · `q` quit.

## If the TUI says "no subagents recorded"

The plugin only captures subagents that were spawned with `isolation: worktree` in their definition. If `/review-agents` shows the empty-state message:

1. Run `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" doctor --repo .` — this checks git repo, binary, manifest, state file, skill registration.
2. If `doctor` says everything is OK / WARN-only, dispatch the bundled canary to fire the hooks once:
   `Task(subagent_type: "wisp-self-test", description: "verify wisp-agentdiff hooks fire", prompt: "go")`
3. Then re-run `/review-agents`. You should now see one agent `wisp-self-test` with a single-line diff.
4. If you've been running many sessions and want to clean up the accumulated worktrees + branches, run `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" prune --dry-run` to see candidates, then drop `--dry-run` to execute.

If the canary runs but state still doesn't update, the WorktreeCreate hook isn't firing — open an issue with the doctor output.

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

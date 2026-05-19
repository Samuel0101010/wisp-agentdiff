---
description: Open the wisp-agentdiff TUI to review per-agent diffs of the current session
allowed-tools: Bash(wisp-agentdiff *)
---

Run `wisp-agentdiff review` in the current working directory. The TUI lists every subagent the current Claude Code session recorded, with per-agent diff, token + tool-call summary, and cross-agent conflict detection.

Hotkeys: `a` approve · `r` revert · `n`/`p` next/prev agent · `c` toggle conflict view · `m` merge approved · `j`/`k` scroll · `q` quit.

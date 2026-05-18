# vhs script for docs/demo.gif
# usage: vhs scripts/demo.tape  (from the repo root)
# requires: vhs >= 0.7 (https://github.com/charmbracelet/vhs) + node 20+
#
# Shot list (auto-advance on approve/revert keeps the rhythm tight):
#   ─ intro line typed
#   ─ wisp-agentdiff review  → 5 agents
#   ─ a a r a a               → approve 4, revert the rogue 'db' agent
#   ─ c                       → conflict view (db vs api both touched pool.ts)
#   ─ c                       → back to diff
#   ─ q                       → quit

Output docs/demo.gif

Set FontSize 14
Set Width 1100
Set Height 640
Set Theme "Catppuccin Mocha"
Set Padding 24
Set Framerate 24
Set PlaybackSpeed 1.0
Set TypingSpeed 32ms

# Seed the synthetic 5-agent session silently before recording.
Hide
Type "node dist/index.js demo --repo . > /dev/null"
Enter
Sleep 600ms
Show

# Scene 1 — intro
Type "# 5 Claude subagents ran in parallel.  One went rogue."
Sleep 1500ms
Enter
Type "# wisp-agentdiff lets you approve or revert each one."
Sleep 1500ms
Enter
Type "clear"
Enter
Sleep 200ms

# Scene 2 — open the TUI
Type "node dist/index.js review --repo ."
Sleep 300ms
Enter
Sleep 1500ms

# Scene 3 — scroll the first agent's diff so the user sees real content
Type "j"
Sleep 250ms
Type "j"
Sleep 250ms
Type "j"
Sleep 800ms

# Scene 4 — decisions.  Auto-advance moves to the next agent after each keystroke.
Type "a"
Sleep 700ms
Type "a"
Sleep 700ms
Type "r"
Sleep 1000ms
Type "a"
Sleep 700ms
Type "a"
Sleep 1200ms

# Scene 5 — conflict view (db rewrites pool.ts, api also touched it)
Type "c"
Sleep 2000ms
Type "c"
Sleep 800ms

# Scene 6 — exit
Type "q"
Sleep 400ms

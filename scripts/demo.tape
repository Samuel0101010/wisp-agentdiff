# vhs script for docs/demo.gif
# usage: vhs scripts/demo.tape
# requires: vhs (https://github.com/charmbracelet/vhs) + node 20+ in PATH
#
# Shot list (per CLAUDE.md):
#   0–3s   "Spawn 5 agents to refactor auth module"
#   3–10s  5 Tasks running in parallel (status pill animation)
#   10–15s agents complete, /review-agents opens TUI
#   15–25s tab through 5 agents, approve 4, revert 1
#   25–30s [m] merges → green confirmation

Output docs/demo.gif

Set FontSize 14
Set Width 1100
Set Height 640
Set Theme "Catppuccin Mocha"
Set Padding 20
Set Framerate 24
Set PlaybackSpeed 1.0
Set TypingSpeed 30ms

# --- Scene 1: explain ---
Type "# 5 Claude subagents ran in parallel. One went rogue."
Sleep 1500ms
Enter
Type "# wisp-agentdiff lets you approve / revert each one."
Sleep 1500ms
Enter
Enter

# --- Scene 2: open the TUI (against a pre-seeded session) ---
Type "wisp-agentdiff review"
Sleep 400ms
Enter
Sleep 1500ms

# --- Scene 3: tab through agents ---
Type "n"
Sleep 700ms
Type "n"
Sleep 700ms
Type "j"
Sleep 200ms
Type "j"
Sleep 200ms
Type "j"
Sleep 700ms

# --- Scene 4: decisions ---
Type "a"
Sleep 600ms
Type "a"
Sleep 600ms
Type "a"
Sleep 600ms
Type "r"
Sleep 800ms
Type "a"
Sleep 800ms

# --- Scene 5: conflicts ---
Type "c"
Sleep 1200ms
Type "c"
Sleep 600ms

# --- Scene 6: merge ---
Type "m"
Sleep 1500ms

# --- Scene 7: exit ---
Type "q"
Sleep 500ms

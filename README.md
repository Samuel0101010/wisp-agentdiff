# wisp-agentdiff

> Per-agent diffs for Claude Code parallel subagent workflows.

<!-- demo-gif-placeholder: docs/demo.gif (autoplay, <5MB) — add before public release -->

**Status:** Pre-release (private repo). Public Launch bei v1.0.0.

## Install (post-launch)

```bash
npx wisp-agentdiff install
```

## Was es macht

Wrappt jeden Claude-Code-Subagent-Spawn in einen isolierten git-Worktree. Nach Completion zeigt `/review-agents` einen 5-Pane-Tab-View pro Agent mit Diff, Token-Cost und Tool-Call-Liste. One-Key Approve/Revert je Agent. Konflikt-Preview wenn zwei Agents dieselbe Datei berühren.

## Status

→ Siehe [CLAUDE.md](./CLAUDE.md) für die Build-Roadmap und Phasen-Tracking.

## License

MIT.

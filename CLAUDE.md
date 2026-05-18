# wisp-agentdiff — Per-Agent Diff Reviewer für Claude Code

> *"Every subagent commits to its own branch — you see exactly what each touched."*

**Status:** PRIORITY #1 — BUILD FIRST. Bestes Effort/Star-Ratio der 9 V2-Ideen (4/10 Effort, 8–15k Star-Range).

---

## Mission

Wenn Claude Code mehrere Subagents parallel spawnt, kann man heute nur "alles oder nichts" mergen. Wenn einer wild lief und 40 Files anfasste — Pech. **wisp-agentdiff** wrappt jeden Subagent-Spawn in einen isolierten git-Worktree (nutzt native Worktree-Iso seit v2.1.50) und liefert nach Completion eine 5-Pane-Tab-View mit Diff, Token-Cost und Tool-Call-Liste pro Agent. One-Key Approve/Revert je Agent.

**Target Stars:** 8–15k. **Effort:** 4/10. **Realistische Launch-Window:** 4–6 Wochen.

---

## Was wird gebaut (mechanisch konkret)

1. **Skill `wisp-agentdiff`** triggert auf User-Phrasen "review the agents", "show me what each agent did", `/review-agents`, oder Auto-Trigger nach `Task`-Tool-Completion mit ≥2 spawned subagents.
2. **Subagent-Wrapper:** Pre-Spawn-Hook erstellt einen git-Worktree pro Subagent (`wisp-agentdiff/agent-<id>` branch). Subagent committet automatisch beim Beenden.
3. **Diff-Collector:** Liest pro Worktree `git diff main...HEAD` + parses Subagent-jsonl-Transkript für Tool-Calls und Token-Cost.
4. **TUI:** 5-Pane-Tab-View (oder N für N Agents). Hotkeys: `a` approve, `r` revert, `n` next agent, `c` show conflict, `m` merge all approved.
5. **Konflikt-Preview:** Wenn 2 Agents dieselbe Datei anfassen → side-by-side highlight vor Merge.
6. **Slash-Command `/review-agents`** öffnet TUI manuell.

**Differentiator:** Worktree-Tools (tazuna, plural, cwt) isolieren — **reviewen aber nicht**. wisp-agentdiff ist der Review-Layer obendrauf. Mechanisch sauber, keine direkte Konkurrenz.

---

## Tech-Stack & Dependencies

- **Sprache:** TypeScript (Node 20+)
- **Build:** tsup für CLI-Bundle, Single-File-Output
- **TUI:** Ink (React für CLI) + ink-diff für Diff-Rendering
- **Git:** simple-git (oder direkt git porcelain v2 calls)
- **Distribution:** npm + `npx wisp-agentdiff install` für Setup
- **Tests:** vitest
- **Lint:** biome (schneller als eslint)

Keine schweren Dependencies. Single-Binary-Feel via tsup.

---

## Projektstruktur

```
wisp-agentdiff/
├── CLAUDE.md                    ← du liest sie gerade
├── README.md                    ← Hero-GIF + 30s-Quickstart (vor Launch)
├── LICENSE                      ← MIT
├── package.json
├── tsup.config.ts
├── biome.json
├── vitest.config.ts
├── .gitignore
├── .github/
│   └── workflows/
│       ├── test.yml             ← CI: build + test + lint
│       └── release.yml          ← bei tag-push: npm publish + gh release
├── .claude/
│   ├── skills/
│   │   └── wisp-agentdiff/
│   │       ├── SKILL.md          ← Anthropic-konformer Skill
│   │       └── helpers/
│   │           └── trigger.md
│   ├── agents/
│   │   └── wisp-agentdiff-reviewer.md ← Optional: Subagent für komplexe Reviews
│   └── commands/
│       └── review-agents.md      ← Slash-Command Definition
├── src/
│   ├── index.ts                  ← CLI Entry (commander)
│   ├── install.ts                ← npx wisp-agentdiff install
│   ├── wrap/
│   │   ├── pre-spawn-hook.ts     ← erstellt Worktree pro Subagent
│   │   ├── post-spawn-hook.ts    ← auto-commit + flag-completion
│   │   └── worktree-manager.ts
│   ├── collect/
│   │   ├── diff-parser.ts        ← git diff → strukturiertes JSON
│   │   ├── jsonl-reader.ts       ← parse subagent transcripts
│   │   └── token-tracker.ts
│   ├── tui/
│   │   ├── app.tsx               ← Ink Root
│   │   ├── tab-bar.tsx           ← Pane-Switcher
│   │   ├── diff-view.tsx
│   │   ├── conflict-view.tsx
│   │   ├── hotkeys.ts
│   │   └── styles.ts
│   └── merge/
│       ├── approver.ts           ← apply approved agents
│       └── conflict-detector.ts
├── tests/
│   ├── fixtures/
│   │   └── sample-subagent-jsonl/
│   ├── wrap.test.ts
│   ├── collect.test.ts
│   └── merge.test.ts
├── scripts/
│   ├── install.sh                ← one-line curl install
│   └── demo.tape                 ← vhs-Skript für demo.gif
└── docs/
    ├── demo.gif                  ← Hero-GIF (autoplay, <5MB)
    ├── architecture.md
    └── launch-checklist.md
```

---

## GitHub Workflow (privat → public bei Launch)

**Regel:** Repo bleibt privat bis v1.0.0 Launch. Jede Task-Completion = Commit + Push + Release-Tag (prerelease).

### Initial Setup (Phase 1, einmalig)

```bash
gh auth status                                         # sicherstellen logged in
gh repo create wisp-agentdiff --private --source=. --remote=origin --description="Per-agent diffs for Claude Code subagent workflows"
git add .
git commit -m "chore: initial scaffolding"
git push -u origin main
gh release create v0.1.0 --prerelease --title "v0.1.0 — scaffolding" --notes "Initial project structure"
```

### Pro abgeschlossener Task

```bash
git add .
git commit -m "<type>: <scope> — <description>"        # conventional commits
git push
# nur bei Phasen-Abschluss (nicht jeder Mikro-Task):
gh release create v0.X.0 --prerelease --notes-from-tag
```

Versionierung: `v0.<phase>.<patch>` bis Launch. Phase abgeschlossen = Minor-Bump.

### Launch (am Ende)

```bash
gh repo edit --visibility public
gh release create v1.0.0 --title "v1.0.0 — Public Launch" --notes-file docs/launch-checklist.md
# HN Show-Post Dienstag 8am EST simultan
```

**Niemals public pushen vor v1.0.0.** Niemand sieht das Repo bis es polish-ready ist.

---

## Build-Roadmap (Checkboxen — abhaken nach Completion)

### Phase 0 — Pre-Flight (Discovery + Reference Study)
- [x] Lies https://github.com/oshiteku/tazuna README (welche Patterns lohnen sich zu klauen)
- [x] Lies https://github.com/zhubert/plural — wie macht es Multi-Worktree-Review
- [x] Lies Anthropic-Docs zu nativem Worktree-Support (https://code.claude.com/docs/en/worktrees)
- [x] Lies Anthropic-Docs zu Skill-Format + Auto-Trigger (https://www.anthropic.com/news/skills)
- [x] Lies Ink-Quickstart (https://github.com/vadimdemedes/ink)

### Phase 1 — Setup
- [x] Repo erstellen: `gh repo create wisp-agentdiff --private`
- [x] `npm init -y`, `tsconfig.json` mit strict mode
- [x] tsup + vitest + biome dev-deps installieren
- [x] `.github/workflows/test.yml` (Node 20, lint + test + build)
- [x] `.github/workflows/release.yml` (auf tag `v*` → npm publish + gh release)
- [x] README skeleton mit Tagline + Install + Demo-Placeholder
- [x] `gh release create v0.1.0 --prerelease`

### Phase 2 — Subagent-Wrapper (Pre/Post-Spawn-Hooks)
- [x] `src/wrap/worktree-manager.ts` — create/list/remove worktrees
- [x] `src/wrap/pre-spawn-hook.ts` — Task-Tool detect, create worktree mit branch `wisp-agentdiff/agent-<id>`
- [x] `src/wrap/post-spawn-hook.ts` — bei Subagent-Completion: auto-commit alle Changes im Worktree
- [x] Tests: spawn fake agent, assert worktree created + cleaned-up
- [x] Commit + push + tag `v0.2.0`

### Phase 3 — Diff Collection
- [x] `src/collect/diff-parser.ts` — `git diff main..wisp-agentdiff/agent-<id>` → JSON (files, +lines, -lines, hunks)
- [x] `src/collect/jsonl-reader.ts` — Subagent-Transkript parsen für Tool-Calls + Token-Counts
- [x] `src/collect/token-tracker.ts` — Aggregation pro Agent
- [x] Tests mit fixtures/sample-subagent-jsonl/
- [x] Commit + push + tag `v0.3.0`

### Phase 4 — TUI (Ink)
- [ ] `src/tui/app.tsx` — Ink Root mit Pane-State
- [ ] `src/tui/tab-bar.tsx` — Top-Bar mit Agent-Tabs (1–N)
- [ ] `src/tui/diff-view.tsx` — Pro-Tab Diff-Pane mit syntax highlighting
- [ ] `src/tui/hotkeys.ts` — a/r/n/c/m hotkeys
- [ ] `src/tui/styles.ts` — minimal theme (3 colors max)
- [ ] Manual-Test mit Mock-Data
- [ ] Commit + push + tag `v0.4.0`

### Phase 5 — Konflikt-Preview
- [ ] `src/merge/conflict-detector.ts` — find files touched by 2+ agents
- [ ] `src/tui/conflict-view.tsx` — side-by-side highlight
- [ ] Tests: synthetische Konflikte
- [ ] Commit + push + tag `v0.5.0`

### Phase 6 — Merge-Logik
- [ ] `src/merge/approver.ts` — apply approved branches sequentially to main worktree
- [ ] Konflikt-Handling: bei conflict, ask user oder auto-revert problem-agent
- [ ] Tests
- [ ] Commit + push + tag `v0.6.0`

### Phase 7 — Skill + Slash-Command + Install
- [ ] `.claude/skills/wisp-agentdiff/SKILL.md` — description triggert auf "review agents", "show what each agent did"
- [ ] `.claude/commands/review-agents.md`
- [ ] `src/install.ts` — `npx wisp-agentdiff install` → kopiert skill+command in user's `.claude/`
- [ ] Smoke-Test: end-to-end mit echter Claude-Code-Session
- [ ] Commit + push + tag `v0.7.0`

### Phase 8 — Demo + Polish
- [ ] `scripts/demo.tape` — vhs-Skript: 5 Subagents spawnen → TUI öffnet → Approve/Revert → Merge
- [ ] `docs/demo.gif` generieren (autoplay, <5MB)
- [ ] README mit Hero-GIF in ersten 200px
- [ ] Twitter-Thread + HN-Post-Draft in `docs/launch-checklist.md`
- [ ] `docs/architecture.md` (für späteren PR-Kontext)
- [ ] Commit + push + tag `v0.9.0`

### Phase 9 — Launch
- [ ] Cross-Test: Windows + Mac + Linux funktioniert
- [ ] `npm publish` (private im pre-launch, public bei v1.0.0)
- [ ] `gh repo edit --visibility public`
- [ ] `gh release create v1.0.0` mit detailed notes
- [ ] HN Show-Post Dienstag 8am EST
- [ ] Twitter-Thread parallel mit GIF
- [ ] Listing in `awesome-claude-code` PRs

---

## Quality Gates (vor jedem Push)

- [ ] `npm run lint` — biome clean
- [ ] `npm run test` — vitest grün
- [ ] `npm run build` — tsup OK
- [ ] Manueller Smoke-Test bei TUI-Änderungen (Ink-Bugs sind subtil)

---

## Launch-Strategie (für Phase 9)

**HN-Titel:** "Show HN: Per-agent diffs for Claude Code parallel subagents"

**Twitter-Hook:** "5 Claude subagents ran in parallel. One went rogue. I needed a way to approve/reject each one independently. So I built wisp-agentdiff." + Hero-GIF.

**Demo-GIF-Shot-List:**
1. 0–3s: Terminal mit Claude Code, User: "Spawn 5 agents to refactor auth module"
2. 3–10s: 5 Tasks laufen parallel (split-pane visualisierung)
3. 10–15s: Agents complete, `/review-agents` öffnet TUI
4. 15–25s: User tabbt durch 5 Agents, sieht Diffs, approved 4, reverted 1
5. 25–30s: Merge → grüner "all merged" Indikator

**Listing:**
- awesome-claude-code-toolkit PR
- claudepluginhub.com submission
- Skill-Marketplace wenn Anthropic Standard akzeptiert

---

## References (NICHT klonen — studieren + besser machen)

- **tazuna** (https://github.com/oshiteku/tazuna) — Worktree-TUI; review-fokus fehlt
- **plural** (https://github.com/zhubert/plural) — Parallel-Sessions; Diff-Per-Agent nicht das Hauptfeature
- **claude-worktree (cwt)** (https://github.com/bucket-robotics/claude-worktree)
- **ccswarm** (https://github.com/nwiizo/ccswarm)
- **Anthropic Worktree Docs** (https://code.claude.com/docs/en/worktrees)
- **Anthropic Skill-Standard** (https://www.anthropic.com/news/skills)
- **Ink-Beispiele** (https://github.com/vadimdemedes/ink/tree/master/examples)

---

## First-Session-Quickstart

Wenn du Claude Code in diesem Ordner startest:

1. **Sage einfach:** "Start Phase 0" oder "Start mit dem nächsten unerledigten Task"
2. Claude liest die Roadmap, identifiziert die erste unabgehakte Box, beginnt.
3. **Pro Task-Completion:**
   - Code committen mit conventional-commit-Message
   - `git push`
   - Bei Phasen-Abschluss: `gh release create v0.X.0 --prerelease`
   - Checkbox in dieser CLAUDE.md von `- [ ]` auf `- [x]` setzen
4. **Vor jedem Commit:** Quality Gates (lint, test, build) laufen lassen.

**Ruflo-Pattern-Recall:**
```
mcp__ruflo__agentdb_pattern-search { query: "wisp-agentdiff subagent worktree diff review" }
mcp__ruflo__memory_search { query: "wisp-agentdiff github idea build first", namespace: "ideas" }
```
Dort liegen die ursprünglichen Pain-Point-Belege + Differentiator-Argumente.

---

## Anti-Patterns (NICHT machen)

- ❌ Repo öffentlich machen vor v1.0.0 — kein Public-Soft-Launch
- ❌ Demo-GIF >5MB — Twitter compressed das zu Brei
- ❌ Mehr als 3 Hauptfeatures vor v1.0.0 — Scope-Creep killt Launches
- ❌ TUI mit >3 Farben — verwirrend in Demo-GIFs
- ❌ Hooks die bei jedem Tool-Call laufen (Token-Burn) — nur bei Task-Tool
- ❌ Hard-Dependency auf Anthropic-internal-APIs — break-on-update-Risiko

---

## Status-Tracking

**Aktuelle Phase:** 4 (Ink TUI)
**Nächste Action:** Ink app.tsx + tab-bar + diff-view + hotkeys.
**Blocker:** keine
**Letzter Release-Tag:** v0.3.0 (prerelease, 2026-05-18)

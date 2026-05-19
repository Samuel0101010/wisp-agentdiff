import { existsSync, readFileSync } from "node:fs";
import { simpleGit } from "simple-git";
import type { AgentRecord } from "../wrap/state.js";
import { type ParsedDiff, parseUnifiedDiff } from "./diff-parser.js";
import { type TranscriptSummary, emptySummary, readTranscript } from "./jsonl-reader.js";

export interface AgentReport {
  agent: AgentRecord;
  diff: ParsedDiff;
  transcript: TranscriptSummary;
  /** Combined diff body kept so the TUI can render syntax-highlight per hunk. */
  rawDiff: string;
  /** "stored" = read from .claude/wisp-agentdiff/diffs/<id>.json (cached at WorktreeRemove);
   *  "live"   = computed from the still-existing worktree on disk at review-time;
   *  "missing"= no stored diff and no worktree to read from. */
  diffSource?: "stored" | "live" | "missing";
}

interface StoredDiff {
  unified: string;
  nameStatus?: string;
}

/**
 * Live-diff fallback. Reads the agent's worktree on disk and computes
 * `git diff <baseRef>` against it — captures committed AND uncommitted
 * changes in one go, without ever mutating the worktree.
 *
 * Needed because Claude Code does not fire WorktreeRemove on subagent
 * completion (worktrees persist until session end / explicit
 * `--remove-worktree`), so the cached-at-remove diff path is empty for
 * the typical review flow.
 */
async function readLiveDiff(agent: AgentRecord): Promise<string> {
  if (!existsSync(agent.path)) return "";
  try {
    // simpleGit on the worktree path; diff arg is the base ref — git resolves it
    // against the worktree's HEAD chain and any uncommitted working-tree state.
    return await simpleGit(agent.path).raw(["diff", agent.baseRef]);
  } catch {
    return "";
  }
}

export async function buildAgentReport(agent: AgentRecord): Promise<AgentReport> {
  let rawDiff = "";
  let diffSource: AgentReport["diffSource"] = "missing";

  if (agent.diffPath && existsSync(agent.diffPath)) {
    const parsed = JSON.parse(readFileSync(agent.diffPath, "utf8")) as StoredDiff;
    rawDiff = parsed.unified ?? "";
    diffSource = "stored";
  }

  // If the stored diff is missing OR empty, try the worktree on disk.
  // This is the typical path because Claude Code worktrees persist until
  // session-end, so the WorktreeRemove cache never gets written during a
  // normal review-while-the-session-is-alive flow.
  if (rawDiff.length === 0) {
    const live = await readLiveDiff(agent);
    if (live.length > 0) {
      rawDiff = live;
      diffSource = "live";
    }
  }

  const diff = parseUnifiedDiff(rawDiff);
  const transcript = agent.transcriptPath
    ? await readTranscript(agent.transcriptPath)
    : emptySummary();
  return { agent, diff, transcript, rawDiff, diffSource };
}

export interface SessionTotals {
  agents: number;
  files: number;
  additions: number;
  deletions: number;
  totalTokens: number;
  totalToolCalls: number;
}

export function aggregateTotals(reports: AgentReport[]): SessionTotals {
  return reports.reduce<SessionTotals>(
    (acc, r) => {
      acc.files += r.diff.totals.files;
      acc.additions += r.diff.totals.additions;
      acc.deletions += r.diff.totals.deletions;
      acc.totalTokens += r.transcript.totalTokens;
      acc.totalToolCalls += r.transcript.totalToolCalls;
      return acc;
    },
    {
      agents: reports.length,
      files: 0,
      additions: 0,
      deletions: 0,
      totalTokens: 0,
      totalToolCalls: 0,
    },
  );
}

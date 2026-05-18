import type { FileChangeKind, FileDiff } from "../collect/diff-parser.js";
import type { AgentReport } from "../collect/token-tracker.js";

export interface ConflictParticipant {
  agentId: string;
  agentName: string;
  branch: string;
  kind: FileChangeKind;
  additions: number;
  deletions: number;
  /** First hunk header — quick visual hint of where the change lives. */
  firstHunk?: string;
}

export interface Conflict {
  path: string;
  participants: ConflictParticipant[];
}

/**
 * Returns the set of files where 2+ agents touched the same path.
 * Order of participants follows the order of `reports` so the TUI can render
 * a stable left-to-right comparison.
 */
export function detectConflicts(reports: AgentReport[]): Conflict[] {
  const byPath = new Map<string, ConflictParticipant[]>();

  for (const report of reports) {
    for (const file of report.diff.files) {
      const list = byPath.get(file.path) ?? [];
      list.push(buildParticipant(report, file));
      byPath.set(file.path, list);
    }
  }

  const conflicts: Conflict[] = [];
  for (const [path, participants] of byPath) {
    if (participants.length >= 2) {
      conflicts.push({ path, participants });
    }
  }
  conflicts.sort((a, b) => a.path.localeCompare(b.path));
  return conflicts;
}

function buildParticipant(report: AgentReport, file: FileDiff): ConflictParticipant {
  return {
    agentId: report.agent.id,
    agentName: report.agent.name,
    branch: report.agent.branch,
    kind: file.kind,
    additions: file.additions,
    deletions: file.deletions,
    ...(file.hunks[0]?.header ? { firstHunk: file.hunks[0].header } : {}),
  };
}

/**
 * Returns true when a set of agent decisions would actually merge two
 * agents into the same file — used as a gating check before `merge all`.
 * `approvedIds` is the subset of agent ids the user marked approved.
 */
export function approvedConflicts(
  conflicts: Conflict[],
  approvedIds: ReadonlySet<string>,
): Conflict[] {
  return conflicts
    .map<Conflict>((c) => ({
      path: c.path,
      participants: c.participants.filter((p) => approvedIds.has(p.agentId)),
    }))
    .filter((c) => c.participants.length >= 2);
}

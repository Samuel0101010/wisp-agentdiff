import { simpleGit } from "simple-git";
import type { AgentReport } from "../collect/token-tracker.js";
import { type Conflict, approvedConflicts, detectConflicts } from "./conflict-detector.js";

export interface MergeOptions {
  repoRoot: string;
  /** Skip the actual merge and only report what would happen. */
  dryRun?: boolean;
  /** Delete the agent branch after a successful merge. Default: true. */
  deleteBranches?: boolean;
  /** Merge strategy. Default: --no-ff for an explicit merge commit per agent. */
  strategy?: "no-ff" | "ff-only" | "squash";
}

export interface AgentMergeOutcome {
  agentId: string;
  agentName: string;
  branch: string;
  status: "merged" | "skipped" | "failed" | "dry-run";
  message?: string;
}

export interface MergeResult {
  merged: AgentMergeOutcome[];
  blockedConflicts: Conflict[];
  /** True iff we attempted (and finished) at least one real merge. */
  attempted: boolean;
}

/**
 * Apply approved-agent branches into the current HEAD sequentially.
 *
 * Refuses to start if any two approved agents touch the same file
 * (those collisions need a per-agent revert first, surfaced by the
 * Conflict view in Phase 5). On a runtime git-conflict during merge,
 * aborts that single merge and returns it as `failed` without
 * touching the remaining queue.
 */
export async function applyApproved(
  reports: AgentReport[],
  approvedIds: ReadonlySet<string>,
  options: MergeOptions,
): Promise<MergeResult> {
  const conflicts = detectConflicts(reports);
  const blocked = approvedConflicts(conflicts, approvedIds);
  if (blocked.length > 0) {
    return { merged: [], blockedConflicts: blocked, attempted: false };
  }

  const approved = reports.filter((r) => approvedIds.has(r.agent.id));
  const dryRun = options.dryRun ?? false;
  const deleteBranches = options.deleteBranches ?? true;
  const strategy = options.strategy ?? "no-ff";
  // Only construct the git instance when we'll actually use it — keeps
  // dry-run safe to call with a non-existent repoRoot in tests.
  const git = dryRun ? null : simpleGit(options.repoRoot);

  const outcomes: AgentMergeOutcome[] = [];

  for (const r of approved) {
    if (dryRun) {
      outcomes.push({
        agentId: r.agent.id,
        agentName: r.agent.name,
        branch: r.agent.branch,
        status: "dry-run",
      });
      continue;
    }

    const args = buildMergeArgs(strategy, r.agent.branch);
    try {
      // git is non-null when dryRun is false
      if (!git) throw new Error("internal: git instance not initialized");
      await git.raw(args);
      if (deleteBranches) {
        try {
          await git.raw(["branch", "-D", r.agent.branch]);
        } catch (err) {
          // branch may already be gone if worktree removal pruned it
          if (process.env.WISP_DEBUG) process.stderr.write(`${String(err)}\n`);
        }
      }
      outcomes.push({
        agentId: r.agent.id,
        agentName: r.agent.name,
        branch: r.agent.branch,
        status: "merged",
      });
    } catch (err) {
      try {
        await git?.raw(["merge", "--abort"]);
      } catch {
        // merge --abort fails if there was no merge in progress; ignore
      }
      outcomes.push({
        agentId: r.agent.id,
        agentName: r.agent.name,
        branch: r.agent.branch,
        status: "failed",
        message: err instanceof Error ? err.message : String(err),
      });
      break;
    }
  }

  // Anything approved but not yet processed is now skipped (we bailed on a failure)
  for (const r of approved) {
    if (outcomes.some((o) => o.agentId === r.agent.id)) continue;
    outcomes.push({
      agentId: r.agent.id,
      agentName: r.agent.name,
      branch: r.agent.branch,
      status: "skipped",
      message: "preceding merge failed",
    });
  }

  return { merged: outcomes, blockedConflicts: [], attempted: !dryRun };
}

function buildMergeArgs(strategy: MergeOptions["strategy"], branch: string): string[] {
  switch (strategy) {
    case "ff-only":
      return ["merge", "--ff-only", branch];
    case "squash":
      return ["merge", "--squash", branch];
    default:
      return ["merge", "--no-ff", "--no-edit", branch];
  }
}

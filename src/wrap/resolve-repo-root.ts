import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { simpleGit } from "simple-git";

/**
 * Matches a wisp-agentdiff inner-worktree leaf at the end of a path:
 *   .../.claude/worktrees/wisp-agentdiff/agent-<hex>
 *
 * Accepts both POSIX (/) and Windows (\) separators since paths on Windows
 * can carry either form depending on how they were assembled.
 */
const INNER_WORKTREE_RE = /[/\\]\.claude[/\\]worktrees[/\\]wisp-agentdiff[/\\]agent-[a-f0-9]+$/i;

const MAX_ITERATIONS = 10;

function normalizePath(p: string): string {
  const abs = resolve(p);
  try {
    return realpathSync.native ? realpathSync.native(abs) : realpathSync(abs);
  } catch {
    // Path doesn't exist on disk — fall back to the resolved absolute form.
    return abs;
  }
}

/**
 * Strip the trailing `.../.claude/worktrees/wisp-agentdiff/agent-<hex>` segment
 * from `path` and return the prefix. Returns `null` if the path doesn't end
 * with that segment.
 */
function stripInnerWorktreeSegment(path: string): string | null {
  const match = path.match(INNER_WORKTREE_RE);
  if (!match) return null;
  return path.slice(0, path.length - match[0].length);
}

/**
 * Resolve the OUTER repository root for a given working directory.
 *
 * When Claude Code dispatches a subagent worktree while the parent context's
 * cwd already lives inside an existing wisp-agentdiff worktree (path matches
 * `.claude/worktrees/wisp-agentdiff/agent-<hex>`), simple `git rev-parse
 * --show-toplevel` returns the INNER worktree. This function detects that
 * shape and walks back out until it finds a toplevel that is NOT itself a
 * nested wisp-agentdiff worktree.
 *
 * Behaviour:
 *   - cwd not in a git repo → returns the normalized absolute cwd
 *   - cwd toplevel doesn't match the inner-worktree shape → returns toplevel
 *   - cwd toplevel matches → strips the segment, runs git toplevel on the
 *     prefix, and repeats (up to 10 iterations)
 *
 * Cross-platform: handles both `/` and `\` separators on Windows.
 */
export async function resolveOuterRepoRoot(cwd: string): Promise<string> {
  let current = normalizePath(cwd);

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let toplevel: string;
    try {
      const raw = await simpleGit(current).revparse(["--show-toplevel"]);
      toplevel = raw.trim();
    } catch {
      // Not inside a git repo — return the normalized cwd unchanged, matching
      // how the existing hook handlers tolerate missing-git situations.
      return current;
    }

    if (!toplevel) return current;

    const normalizedToplevel = normalizePath(toplevel);
    const prefix = stripInnerWorktreeSegment(normalizedToplevel);
    if (!prefix) {
      // Toplevel is not a wisp-agentdiff inner worktree — done.
      return normalizedToplevel;
    }

    // Toplevel IS a nested wisp-agentdiff worktree. Move outward and retry.
    current = normalizePath(prefix);
  }

  // Safety bound exceeded — return whatever we have rather than loop forever.
  return current;
}

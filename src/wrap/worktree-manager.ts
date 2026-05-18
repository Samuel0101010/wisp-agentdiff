import { existsSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { type SimpleGit, simpleGit } from "simple-git";

function normalizePath(p: string): string {
  const abs = resolve(p);
  try {
    return realpathSync.native ? realpathSync.native(abs) : realpathSync(abs);
  } catch {
    return abs;
  }
}

export interface WorktreeOptions {
  /** Name slug; will be normalized to safe characters. */
  name: string;
  /** Base ref to branch from. Defaults to current HEAD. */
  baseRef?: string;
  /** Branch prefix. Defaults to `wisp-agentdiff/agent-`. */
  branchPrefix?: string;
  /** Base directory for worktrees. Defaults to `<repo>/.claude/worktrees/wisp-agentdiff`. */
  basePath?: string;
}

export interface CreatedWorktree {
  name: string;
  path: string;
  branch: string;
  baseRef: string;
}

export interface WorktreeListEntry {
  path: string;
  branch?: string;
  head: string;
  bare: boolean;
}

const SAFE_NAME = /[^a-zA-Z0-9._-]+/g;

export function sanitizeName(name: string): string {
  const slug = name.replace(SAFE_NAME, "-").replace(/^-+|-+$/g, "");
  if (!slug) throw new Error(`worktree name resolves to empty slug: ${name}`);
  return slug;
}

export function defaultBasePath(repoRoot: string): string {
  return join(repoRoot, ".claude", "worktrees", "wisp-agentdiff");
}

export class WorktreeManager {
  private readonly git: SimpleGit;
  readonly repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = resolve(repoRoot);
    this.git = simpleGit(this.repoRoot);
  }

  async resolveHead(): Promise<string> {
    const sha = (await this.git.revparse(["HEAD"])).trim();
    if (!sha) throw new Error("could not resolve HEAD — is this a git repo?");
    return sha;
  }

  async create(opts: WorktreeOptions): Promise<CreatedWorktree> {
    const safeName = sanitizeName(opts.name);
    const branchPrefix = opts.branchPrefix ?? "wisp-agentdiff/agent-";
    const branch = `${branchPrefix}${safeName}`;
    const basePath = opts.basePath ?? defaultBasePath(this.repoRoot);
    const path = join(basePath, safeName);

    const baseRef = opts.baseRef ?? (await this.resolveHead());

    if (existsSync(path)) {
      throw new Error(`worktree path already exists: ${path}`);
    }
    mkdirSync(dirname(path), { recursive: true });

    await this.git.raw(["worktree", "add", "-b", branch, path, baseRef]);

    return { name: safeName, path: normalizePath(path), branch, baseRef };
  }

  async list(): Promise<WorktreeListEntry[]> {
    const out = await this.git.raw(["worktree", "list", "--porcelain"]);
    const entries: WorktreeListEntry[] = [];
    let current: Partial<WorktreeListEntry> = {};
    for (const line of out.split(/\r?\n/)) {
      if (line.startsWith("worktree ")) {
        if (current.path) entries.push(current as WorktreeListEntry);
        current = { path: normalizePath(line.slice("worktree ".length)), head: "", bare: false };
      } else if (line.startsWith("HEAD ")) {
        current.head = line.slice("HEAD ".length);
      } else if (line.startsWith("branch ")) {
        current.branch = line.slice("branch ".length);
      } else if (line === "bare") {
        current.bare = true;
      }
    }
    if (current.path) entries.push(current as WorktreeListEntry);
    return entries;
  }

  /**
   * Commit any pending changes inside the worktree to its branch.
   * Used by the post-spawn hook to capture subagent edits before review.
   */
  async commitPending(worktreePath: string, message: string): Promise<string | null> {
    const sub = simpleGit(worktreePath);
    const status = await sub.status();
    if (status.files.length === 0) return null;
    await sub.add(["-A"]);
    const result = await sub.commit(message, [], { "--no-verify": null });
    return result.commit || null;
  }

  /**
   * Diff a worktree branch against a base ref. Returns full unified diff text.
   */
  async diffAgainst(branch: string, baseRef: string): Promise<string> {
    return await this.git.raw(["diff", `${baseRef}...${branch}`]);
  }

  async diffNameStatus(branch: string, baseRef: string): Promise<string> {
    return await this.git.raw(["diff", "--name-status", `${baseRef}...${branch}`]);
  }

  async remove(worktreePath: string, options: { force?: boolean } = {}): Promise<void> {
    const args = ["worktree", "remove"];
    if (options.force) args.push("--force");
    args.push(worktreePath);
    await this.git.raw(args);
  }

  async deleteBranch(branch: string, options: { force?: boolean } = {}): Promise<void> {
    await this.git.raw(["branch", options.force ? "-D" : "-d", branch]);
  }

  async pruneIfMissing(worktreePath: string): Promise<void> {
    if (!existsSync(worktreePath)) {
      await this.git.raw(["worktree", "prune"]);
      return;
    }
    rmSync(worktreePath, { recursive: true, force: true });
    await this.git.raw(["worktree", "prune"]);
  }
}

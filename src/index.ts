import { readFileSync } from "node:fs";
import { Command } from "commander";
import { handleWorktreeRemove } from "./wrap/post-spawn-hook.js";
import { handleWorktreeCreate } from "./wrap/pre-spawn-hook.js";

const program = new Command();

program
  .name("wisp-agentdiff")
  .description("Per-agent diffs for Claude Code parallel subagent workflows")
  .version("0.1.0");

program
  .command("install")
  .description("Install wisp-agentdiff skill, slash command, and hook snippet into ~/.claude")
  .option("--target <dir>", "override target directory (default ~/.claude or $CLAUDE_CONFIG_DIR)")
  .action(async (opts: { target?: string }) => {
    const { installArtifacts } = await import("./install.js");
    installArtifacts({
      ...(opts.target ? { targetDir: opts.target } : {}),
    });
  });

program
  .command("review")
  .description("Open the TUI to review per-agent diffs of the current session")
  .option("--repo <dir>", "repository root", process.cwd())
  .action(async (opts: { repo: string }) => {
    const { runReviewTui } = await import("./tui/run.js");
    await runReviewTui({ repoRoot: opts.repo });
  });

const hook = program
  .command("hook")
  .description("Native Claude Code worktree hook entry points (stdin JSON → stdout JSON)");

hook
  .command("worktree-create")
  .description("Handle WorktreeCreate hook (stdin payload, prints path to stdout)")
  .option("--repo <dir>", "repository root", process.cwd())
  .action(async (opts: { repo: string }) => {
    const payload = readStdinJson<{ name: string; baseRef?: string; agentId?: string }>();
    const result = await handleWorktreeCreate(payload, { repoRoot: opts.repo });
    process.stdout.write(`${result.path}\n`);
    if (process.env.WISP_DEBUG) process.stderr.write(`${JSON.stringify(result)}\n`);
  });

hook
  .command("worktree-remove")
  .description("Handle WorktreeRemove hook (stdin payload, captures diff then removes)")
  .option("--repo <dir>", "repository root", process.cwd())
  .action(async (opts: { repo: string }) => {
    const payload = readStdinJson<{
      name: string;
      agentId?: string;
      keep?: boolean;
      transcriptPath?: string;
    }>();
    const result = await handleWorktreeRemove(payload, { repoRoot: opts.repo });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  });

function readStdinJson<T>(): T {
  const raw = readFileSync(0, "utf8").trim();
  if (!raw) throw new Error("expected JSON payload on stdin");
  return JSON.parse(raw) as T;
}

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`wisp-agentdiff: ${msg}\n`);
  process.exit(1);
});

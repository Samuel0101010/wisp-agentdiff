import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { handleWorktreeRemove } from "./wrap/post-spawn-hook.js";
import { handleWorktreeCreate } from "./wrap/pre-spawn-hook.js";

const PKG_VERSION = readPackageVersion();

const program = new Command();

program
  .name("wisp-agentdiff")
  .description("Per-agent diffs for Claude Code parallel subagent workflows")
  .version(PKG_VERSION);

program
  .command("install")
  .description("Install wisp-agentdiff skill, slash command, and hook snippet into ~/.claude")
  .option("--target <dir>", "override target directory (default ~/.claude or $CLAUDE_CONFIG_DIR)")
  .action(async (opts: { target?: string }) => {
    const { installArtifacts } = await import("./install.js");
    try {
      installArtifacts({
        ...(opts.target ? { targetDir: opts.target } : {}),
      });
    } catch (err) {
      process.stderr.write(`install failed: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  });

program
  .command("review")
  .description("Open the TUI to review per-agent diffs of the current session")
  .option("--repo <dir>", "repository root", process.cwd())
  .action(async (opts: { repo: string }) => {
    const { runReviewTui } = await import("./tui/run.js");
    await runReviewTui({ repoRoot: opts.repo });
  });

program
  .command("demo")
  .description("Seed a synthetic 5-agent session so 'review' has data (used by the demo GIF)")
  .option("--repo <dir>", "repository root", process.cwd())
  .action(async (opts: { repo: string }) => {
    const { seedDemo } = await import("./demo.js");
    seedDemo(opts.repo);
    process.stdout.write("seeded demo state — run: wisp-agentdiff review\n");
  });

program
  .command("doctor")
  .description("Diagnose plugin install + hook wiring + state — prints OK / WARN / FAIL per check")
  .option("--repo <dir>", "repository root", process.cwd())
  .action(async (opts: { repo: string }) => {
    const { runDoctor } = await import("./doctor.js");
    const code = await runDoctor(opts.repo);
    process.exit(code);
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

const MAX_STDIN_BYTES = 1 * 1024 * 1024; // 1 MiB — Claude Code hook payloads are tiny

function readStdinJson<T>(): T {
  if (process.stdin.isTTY) {
    throw new Error(
      "expected JSON payload on stdin (hooks pipe their payload — don't invoke this subcommand interactively)",
    );
  }
  const buf = readFileSync(0);
  if (buf.length > MAX_STDIN_BYTES) {
    throw new Error(`stdin payload exceeds ${MAX_STDIN_BYTES} bytes`);
  }
  const raw = buf.toString("utf8").trim();
  if (!raw) throw new Error("expected JSON payload on stdin");
  return JSON.parse(raw) as T;
}

function readPackageVersion(): string {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    const pkgPath = join(dirname(thisFile), "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`wisp-agentdiff: ${msg}\n`);
  process.exit(1);
});

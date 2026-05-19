import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { handleWorktreeRemove } from "./wrap/post-spawn-hook.js";
import { type WorktreeCreatePayload, handleWorktreeCreate } from "./wrap/pre-spawn-hook.js";

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

program
  .command("prune")
  .description("Garbage-collect orphaned worktrees + wisp-agentdiff/agent-* branches")
  .option("--repo <dir>", "repository root", process.cwd())
  .option(
    "--older-than-hours <hours>",
    "only prune entries older than N hours (default 168)",
    "168",
  )
  .option("--all", "ignore age cutoff and prune everything captured")
  .option("--dry-run", "print the plan, do not execute")
  .action(
    async (opts: { repo: string; olderThanHours: string; all?: boolean; dryRun?: boolean }) => {
      const { runPrune } = await import("./prune.js");
      const result = await runPrune({
        repoRoot: opts.repo,
        olderThanHours: Number(opts.olderThanHours),
        all: opts.all ?? false,
        dryRun: opts.dryRun ?? false,
      });
      const counts = { "state-orphan": 0, "fs-orphan": 0, "aged-out": 0 };
      for (const c of result.candidates) counts[c.kind]++;
      process.stdout.write(
        `wisp-agentdiff prune — scanned ${result.scanned.agents} agents, ${result.scanned.fsWorktrees} fs worktrees\n`,
      );
      process.stdout.write(
        `  ${result.candidates.length} candidates: ${counts["state-orphan"]} state-orphan, ${counts["fs-orphan"]} fs-orphan, ${counts["aged-out"]} aged-out\n`,
      );
      if (opts.dryRun) {
        for (const c of result.candidates) {
          const label = c.name ?? c.agentId ?? c.path;
          process.stdout.write(`  [dry-run] ${c.kind}  ${label}  — ${c.reason}\n`);
        }
      } else {
        const prunedSet = new Set(result.pruned);
        for (const c of result.candidates) {
          const label = c.name ?? c.agentId ?? c.path;
          const err = result.errors.find((e) => e.item === c);
          if (err) {
            process.stdout.write(`  FAIL  ${c.kind}  ${label}  — ${err.message}\n`);
          } else if (prunedSet.has(c)) {
            process.stdout.write(`  OK    ${c.kind}  ${label}\n`);
          }
        }
        process.stdout.write(
          `pruned ${result.pruned.length} of ${result.candidates.length}, errors ${result.errors.length}\n`,
        );
      }
      process.exit(0);
    },
  );

const hook = program
  .command("hook")
  .description("Native Claude Code worktree hook entry points (stdin JSON → stdout JSON)");

hook
  .command("worktree-create")
  .description("Handle WorktreeCreate hook (stdin payload, prints path to stdout)")
  .option("--repo <dir>", "repository root", process.cwd())
  .action(async (opts: { repo: string }) => {
    const payload = readStdinJson<WorktreeCreatePayload>();
    const result = await handleWorktreeCreate(payload, { repoRoot: opts.repo });
    process.stdout.write(`${result.path}\n`);
    if (process.env.WISP_DEBUG) process.stderr.write(`${JSON.stringify(result)}\n`);
  });

hook
  .command("pre-tool-use")
  .description(
    "Handle PreToolUse hook for matcher 'Task' — records subagent_type for WorktreeCreate correlation",
  )
  .option("--repo <dir>", "repository root", process.cwd())
  .action(async (opts: { repo: string }) => {
    const { handlePreToolUse } = await import("./wrap/pre-tool-use-hook.js");
    type PreToolUsePayload = Parameters<typeof handlePreToolUse>[0];
    let payload: PreToolUsePayload;
    try {
      payload = readStdinJson<PreToolUsePayload>();
    } catch {
      // PreToolUse must never block tool execution — exit silently on bad input
      return;
    }
    handlePreToolUse(payload, { repoRoot: opts.repo });
    // No stdout — we don't want to influence Claude's tool execution.
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

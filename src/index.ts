import { Command } from "commander";

const program = new Command();

program
  .name("wisp-agentdiff")
  .description("Per-agent diffs for Claude Code parallel subagent workflows")
  .version("0.1.0");

program
  .command("install")
  .description("Install wisp-agentdiff skill, slash command, and hooks into ~/.claude")
  .action(() => {
    console.log("install: not implemented yet (Phase 7)");
    process.exitCode = 1;
  });

program
  .command("review")
  .description("Open the TUI to review per-agent diffs of the current session")
  .action(() => {
    console.log("review: not implemented yet (Phase 4)");
    process.exitCode = 1;
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface InstallOptions {
  /** Override target ~/.claude (used for tests). */
  targetDir?: string;
  /** Override package root (auto-detected from import.meta.url otherwise). */
  packageRoot?: string;
  /** When true, also print hook-snippet instructions to stdout. Default true. */
  printHookSnippet?: boolean;
}

export interface InstallResult {
  skillPath: string;
  commandPath: string;
  hookSnippetPath: string;
}

export function defaultTargetDir(): string {
  return process.env.CLAUDE_CONFIG_DIR
    ? resolve(process.env.CLAUDE_CONFIG_DIR)
    : join(homedir(), ".claude");
}

export function resolvePackageRoot(): string {
  // dist/index.js → ../ = package root
  const thisFile = fileURLToPath(import.meta.url);
  return resolve(dirname(thisFile), "..");
}

export function installArtifacts(options: InstallOptions = {}): InstallResult {
  const target = options.targetDir ?? defaultTargetDir();
  const pkgRoot = options.packageRoot ?? resolvePackageRoot();

  // Source paths now mirror the plugin layout — skill/command live at the
  // same relative paths inside the package that they will live at inside
  // ~/.claude.  templates/hooks-snippet.json is still kept for the
  // `npx wisp-agentdiff install` flow's printed copy-paste hint.
  const skillSrc = join(pkgRoot, "skills", "wisp-agentdiff", "SKILL.md");
  const cmdSrc = join(pkgRoot, "commands", "review-agents.md");
  const hookSrc = join(pkgRoot, "templates", "hooks-snippet.json");

  for (const p of [skillSrc, cmdSrc, hookSrc]) {
    if (!existsSync(p)) {
      throw new Error(`required artifact not found at ${p} — reinstall wisp-agentdiff`);
    }
  }

  const skillDst = join(target, "skills", "wisp-agentdiff", "SKILL.md");
  mkdirSync(dirname(skillDst), { recursive: true });
  copyFileSync(skillSrc, skillDst);

  const cmdDst = join(target, "commands", "review-agents.md");
  mkdirSync(dirname(cmdDst), { recursive: true });
  copyFileSync(cmdSrc, cmdDst);

  if (options.printHookSnippet !== false) {
    const snippet = readFileSync(hookSrc, "utf8");
    process.stdout.write("\n");
    process.stdout.write(`✓ Installed skill   → ${skillDst}\n`);
    process.stdout.write(`✓ Installed command → ${cmdDst}\n`);
    process.stdout.write("\n");
    process.stdout.write("Next step — wire the native Claude Code worktree hooks.\n");
    process.stdout.write(`Add this block to ${join(target, "settings.json")}:\n\n`);
    process.stdout.write(snippet);
    process.stdout.write("\n");
    process.stdout.write("Tip: if you'd rather Claude Code wire the hooks itself, run\n");
    process.stdout.write("  /plugin install Samuel0101010/wisp-agentdiff\n");
    process.stdout.write("inside any Claude Code session — that path skips this manual step.\n");
  }

  return { skillPath: skillDst, commandPath: cmdDst, hookSnippetPath: hookSrc };
}

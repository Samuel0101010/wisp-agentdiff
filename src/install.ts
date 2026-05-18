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
  const templates = join(pkgRoot, "templates");

  if (!existsSync(templates)) {
    throw new Error(
      `templates/ not found at ${templates} — reinstall wisp-agentdiff or pass packageRoot`,
    );
  }

  const skillSrc = join(templates, "skill.md");
  const skillDst = join(target, "skills", "wisp-agentdiff", "SKILL.md");
  mkdirSync(dirname(skillDst), { recursive: true });
  copyFileSync(skillSrc, skillDst);

  const cmdSrc = join(templates, "review-agents.md");
  const cmdDst = join(target, "commands", "review-agents.md");
  mkdirSync(dirname(cmdDst), { recursive: true });
  copyFileSync(cmdSrc, cmdDst);

  const hookSrc = join(templates, "hooks-snippet.json");

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
    process.stdout.write(
      "Then in any repo, run a Task with isolation: worktree in its frontmatter,\n",
    );
    process.stdout.write("and afterwards open the review with: wisp-agentdiff review\n");
  }

  return { skillPath: skillDst, commandPath: cmdDst, hookSnippetPath: hookSrc };
}

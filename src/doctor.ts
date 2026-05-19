import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { simpleGit } from "simple-git";
import { type State, stateFilePath } from "./wrap/state.js";

interface CheckResult {
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

const GREEN = "[32m";
const YELLOW = "[33m";
const RED = "[31m";
const DIM = "[2m";
const RESET = "[0m";

function tag(status: CheckResult["status"]): string {
  switch (status) {
    case "ok":
      return `${GREEN}OK  ${RESET}`;
    case "warn":
      return `${YELLOW}WARN${RESET}`;
    case "fail":
      return `${RED}FAIL${RESET}`;
  }
}

export async function runDoctor(repoRoot: string): Promise<number> {
  const checks: CheckResult[] = [];
  const root = resolve(repoRoot);

  // 1 — workspace is a git repo
  let gitRoot: string | null = null;
  try {
    const out = await simpleGit(root).revparse(["--show-toplevel"]);
    gitRoot = out.trim();
    checks.push({
      label: "workspace is a git repo",
      status: "ok",
      detail: gitRoot,
    });
  } catch {
    checks.push({
      label: "workspace is a git repo",
      status: "fail",
      detail: `no git repo at ${root}. WorktreeCreate hooks only fire in git workspaces — run \`git init\` here first.`,
    });
  }

  // 2 — plugin install root reachable
  const thisFile = fileURLToPath(import.meta.url);
  const distDir = dirname(thisFile);
  const distExists = existsSync(join(distDir, "index.js"));
  checks.push({
    label: "wisp-agentdiff binary present",
    status: distExists ? "ok" : "fail",
    detail: distExists ? join(distDir, "index.js") : `expected at ${distDir}`,
  });

  const pluginRootCandidate = resolve(distDir, "..");
  const pluginManifest = join(pluginRootCandidate, ".claude-plugin", "plugin.json");
  if (existsSync(pluginManifest)) {
    let version = "unknown";
    try {
      version =
        (JSON.parse(readFileSync(pluginManifest, "utf8")) as { version?: string }).version ??
        "unknown";
    } catch {
      // ignore — version-detection failure isn't fatal
    }
    checks.push({
      label: "plugin manifest reachable",
      status: "ok",
      detail: `${pluginManifest} (v${version})`,
    });
  } else {
    checks.push({
      label: "plugin manifest reachable",
      status: "warn",
      detail: `${pluginManifest} not found — running outside a /plugin install? That's fine for the npm-install path.`,
    });
  }

  // 3 — state file
  const statePath = stateFilePath(root);
  if (existsSync(statePath)) {
    try {
      const state = JSON.parse(readFileSync(statePath, "utf8")) as State;
      const age = Date.now() - statSync(statePath).mtimeMs;
      const ageStr =
        age < 60_000 ? `${Math.round(age / 1_000)}s ago` : `${Math.round(age / 60_000)}m ago`;
      checks.push({
        label: "state file present",
        status: "ok",
        detail: `${state.agents.length} agent(s) recorded — last modified ${ageStr}`,
      });
    } catch (err) {
      checks.push({
        label: "state file present",
        status: "fail",
        detail: `state file at ${statePath} is unreadable: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  } else {
    checks.push({
      label: "state file present",
      status: "warn",
      detail: `${statePath} does not exist yet — no worktree subagent has run in this directory. Try dispatching the bundled \`wisp-self-test\` subagent to populate it.`,
    });
  }

  // 4 — user's ~/.claude has the wisp-agentdiff skill (npm-install path)
  const claudeRoot = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
  const skillCopy = join(claudeRoot, "skills", "wisp-agentdiff", "SKILL.md");
  if (existsSync(skillCopy)) {
    checks.push({
      label: "skill registered in ~/.claude",
      status: "ok",
      detail: skillCopy,
    });
  } else {
    checks.push({
      label: "skill registered in ~/.claude",
      status: "warn",
      detail: `${skillCopy} not found — this is fine if you installed via /plugin install (auto-registered) but not via npm.`,
    });
  }

  // Render
  const banner = `${DIM}── wisp-agentdiff doctor — ${root}${RESET}`;
  process.stdout.write(`${banner}\n\n`);
  let firstFail = -1;
  checks.forEach((c, i) => {
    process.stdout.write(`  ${tag(c.status)}  ${c.label}\n        ${DIM}${c.detail}${RESET}\n`);
    if (c.status === "fail" && firstFail < 0) firstFail = i;
  });
  process.stdout.write("\n");
  if (firstFail >= 0) {
    process.stdout.write(
      `${RED}One or more checks failed — fix the first FAIL row before running /review-agents.${RESET}\n`,
    );
    return 1;
  }
  const anyWarn = checks.some((c) => c.status === "warn");
  if (anyWarn) {
    process.stdout.write(
      `${YELLOW}All required checks passed; warnings above explain the empty-state behavior.${RESET}\n`,
    );
    return 0;
  }
  process.stdout.write(
    `${GREEN}All checks passed — plugin is wired correctly and state file has captured agents.${RESET}\n`,
  );
  return 0;
}

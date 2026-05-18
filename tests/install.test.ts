import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installArtifacts } from "../src/install.js";

const REPO_ROOT = resolve(__dirname, "..");

describe("installArtifacts", () => {
  let target: string;
  beforeEach(() => {
    target = mkdtempSync(join(tmpdir(), "wisp-install-"));
  });
  afterEach(() => {
    try {
      rmSync(target, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("copies SKILL.md and review-agents.md into the target tree", () => {
    const result = installArtifacts({
      targetDir: target,
      packageRoot: REPO_ROOT,
      printHookSnippet: false,
    });
    expect(existsSync(result.skillPath)).toBe(true);
    expect(existsSync(result.commandPath)).toBe(true);

    const skill = readFileSync(result.skillPath, "utf8");
    expect(skill).toContain("review the agents");
    expect(skill).toContain("/review-agents");

    const cmd = readFileSync(result.commandPath, "utf8");
    expect(cmd).toContain("wisp-agentdiff review");
    expect(cmd).toContain("approve");
  });

  it("places artifacts under skills/wisp-agentdiff and commands/", () => {
    const result = installArtifacts({
      targetDir: target,
      packageRoot: REPO_ROOT,
      printHookSnippet: false,
    });
    expect(result.skillPath.endsWith(join("skills", "wisp-agentdiff", "SKILL.md"))).toBe(true);
    expect(result.commandPath.endsWith(join("commands", "review-agents.md"))).toBe(true);
  });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type SimpleGit, simpleGit } from "simple-git";

export interface TempRepo {
  root: string;
  git: SimpleGit;
  cleanup: () => void;
}

export async function makeTempRepo(): Promise<TempRepo> {
  const root = mkdtempSync(join(tmpdir(), "wisp-test-"));
  mkdirSync(root, { recursive: true });
  const git = simpleGit(root);
  await git.init(["-b", "main"]);
  await git.addConfig("user.email", "test@example.com");
  await git.addConfig("user.name", "Test");
  await git.addConfig("commit.gpgsign", "false");
  writeFileSync(join(root, "README.md"), "# base\n", "utf8");
  await git.add(["README.md"]);
  await git.commit("init");
  return {
    root,
    git,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // ignore — Windows can hold handles briefly
      }
    },
  };
}

/**
 * Minimal unified-diff parser.
 *
 * Designed for what the TUI actually needs: per-file additions/deletions,
 * hunk headers, raw lines. Not a full git-diff AST — we deliberately drop
 * binary diff payloads, renames-without-changes, and similarity headers.
 */

export type FileChangeKind = "added" | "deleted" | "modified" | "renamed" | "binary";

export interface DiffLine {
  /** "+" added, "-" removed, " " context, "\\" newline-marker. */
  kind: "+" | "-" | " " | "\\";
  text: string;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface FileDiff {
  /** Path after rename / addition. */
  path: string;
  /** Original path when renamed/deleted. */
  oldPath?: string;
  kind: FileChangeKind;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  binary: boolean;
}

export interface ParsedDiff {
  files: FileDiff[];
  totals: { files: number; additions: number; deletions: number };
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

export function parseUnifiedDiff(text: string): ParsedDiff {
  const lines = text.split(/\r?\n/);
  const files: FileDiff[] = [];
  let current: FileDiff | null = null;
  let hunk: DiffHunk | null = null;

  const finalizeHunk = () => {
    if (hunk && current) current.hunks.push(hunk);
    hunk = null;
  };
  const finalizeFile = () => {
    finalizeHunk();
    if (current) files.push(current);
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    if (line.startsWith("diff --git ")) {
      finalizeFile();
      const m = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      const oldP = m?.[1] ?? "";
      const newP = m?.[2] ?? oldP;
      current = {
        path: newP,
        kind: "modified",
        additions: 0,
        deletions: 0,
        hunks: [],
        binary: false,
        ...(oldP !== newP ? { oldPath: oldP } : {}),
      };
      continue;
    }

    if (!current) continue;

    if (line.startsWith("new file mode")) current.kind = "added";
    else if (line.startsWith("deleted file mode")) current.kind = "deleted";
    else if (line.startsWith("rename from ")) {
      current.kind = "renamed";
      current.oldPath = line.slice("rename from ".length);
    } else if (line.startsWith("rename to ")) {
      current.path = line.slice("rename to ".length);
    } else if (line.startsWith("Binary files ")) {
      current.kind = "binary";
      current.binary = true;
      finalizeHunk();
    } else if (line.startsWith("--- ")) {
      const p = line.slice(4);
      if (p !== "/dev/null") {
        const stripped = p.replace(/^a\//, "").replace(/^"a\//, "").replace(/"$/, "");
        if (!current.oldPath && stripped !== current.path) current.oldPath = stripped;
      }
    } else if (line.startsWith("+++ ")) {
      const p = line.slice(4);
      if (p !== "/dev/null") {
        const stripped = p.replace(/^b\//, "").replace(/^"b\//, "").replace(/"$/, "");
        if (stripped) current.path = stripped;
      }
    } else if (line.startsWith("@@")) {
      finalizeHunk();
      const m = HUNK_RE.exec(line);
      if (!m) continue;
      hunk = {
        header: line,
        oldStart: Number(m[1]),
        oldLines: m[2] ? Number(m[2]) : 1,
        newStart: Number(m[3]),
        newLines: m[4] ? Number(m[4]) : 1,
        lines: [],
      };
    } else if (hunk) {
      if (line.startsWith("+")) {
        hunk.lines.push({ kind: "+", text: line.slice(1) });
        current.additions++;
      } else if (line.startsWith("-")) {
        hunk.lines.push({ kind: "-", text: line.slice(1) });
        current.deletions++;
      } else if (line.startsWith(" ")) {
        hunk.lines.push({ kind: " ", text: line.slice(1) });
      } else if (line.startsWith("\\")) {
        hunk.lines.push({ kind: "\\", text: line.slice(1) });
      }
    }
  }
  finalizeFile();

  const totals = files.reduce(
    (acc, f) => {
      acc.additions += f.additions;
      acc.deletions += f.deletions;
      return acc;
    },
    { files: files.length, additions: 0, deletions: 0 },
  );

  return { files, totals };
}

/**
 * Parse `git diff --name-status` output into a path → kind map.
 * Useful for cross-agent conflict detection without loading full diffs.
 */
export function parseNameStatus(text: string): Map<string, FileChangeKind> {
  const out = new Map<string, FileChangeKind>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [code, ...rest] = line.split(/\t/);
    if (!code || rest.length === 0) continue;
    const path = rest[rest.length - 1];
    if (!path) continue;
    const c = code[0];
    if (c === "A") out.set(path, "added");
    else if (c === "D") out.set(path, "deleted");
    else if (c === "R") out.set(path, "renamed");
    else out.set(path, "modified");
  }
  return out;
}

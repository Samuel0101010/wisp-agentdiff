import { Box, Text } from "ink";
import type React from "react";
import { useMemo } from "react";
import type { AgentReport } from "../collect/token-tracker.js";
import { theme } from "./styles.js";

interface DiffViewProps {
  report: AgentReport;
  scroll: number;
  viewportLines?: number;
}

/**
 * Renders a windowed slice of the per-file diff. We flatten hunks into a single
 * stream so scrolling stays predictable; per the Ink research, parsing must be
 * memoized — diff text doesn't change between keystrokes, but the parent
 * re-renders on every input event.
 */
export const DiffView: React.FC<DiffViewProps> = ({ report, scroll, viewportLines = 24 }) => {
  const flat = useMemo(() => flattenDiff(report), [report]);

  if (flat.length === 0) {
    return (
      <Box paddingX={1}>
        <Text color={theme.muted}>(no changes recorded for this agent)</Text>
      </Box>
    );
  }

  const start = Math.min(scroll, Math.max(0, flat.length - 1));
  const slice = flat.slice(start, start + viewportLines);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={theme.muted}>
        line {start + 1}–{start + slice.length} of {flat.length} · {report.diff.totals.files} files
        · +{report.diff.totals.additions} -{report.diff.totals.deletions}
      </Text>
      {slice.map((row, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: diff rows are positional; identical text repeats legitimately
        <Text key={`${start}-${i}-${row.kind}`} color={rowColor(row.kind)}>
          {row.text}
        </Text>
      ))}
    </Box>
  );
};

type RowKind = "header" | "hunk" | "added" | "removed" | "context" | "note";
interface FlatRow {
  kind: RowKind;
  text: string;
}

function flattenDiff(report: AgentReport): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const file of report.diff.files) {
    rows.push({
      kind: "header",
      text: `── ${file.kind.padEnd(8)} ${file.path}${file.oldPath ? `  ⟵ ${file.oldPath}` : ""}`,
    });
    if (file.binary) {
      rows.push({ kind: "note", text: "  (binary file)" });
      continue;
    }
    for (const hunk of file.hunks) {
      rows.push({ kind: "hunk", text: hunk.header });
      for (const line of hunk.lines) {
        if (line.kind === "+") rows.push({ kind: "added", text: `+ ${line.text}` });
        else if (line.kind === "-") rows.push({ kind: "removed", text: `- ${line.text}` });
        else rows.push({ kind: "context", text: `  ${line.text}` });
      }
    }
  }
  return rows;
}

function rowColor(kind: RowKind): string | undefined {
  switch (kind) {
    case "header":
      return theme.accent;
    case "hunk":
      return theme.warning;
    case "added":
      return theme.added;
    case "removed":
      return theme.removed;
    case "note":
      return theme.muted;
    default:
      return undefined;
  }
}

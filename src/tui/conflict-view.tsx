import { Box, Text } from "ink";
import type React from "react";
import type { Conflict } from "../merge/conflict-detector.js";
import { theme } from "./styles.js";

interface ConflictViewProps {
  conflicts: Conflict[];
  /** Index of the active conflict; clamped by caller. */
  activeConflict?: number;
}

export const ConflictView: React.FC<ConflictViewProps> = ({ conflicts, activeConflict = 0 }) => {
  if (conflicts.length === 0) {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color={theme.added}>no cross-agent file conflicts — safe to merge</Text>
      </Box>
    );
  }

  const idx = Math.max(0, Math.min(activeConflict, conflicts.length - 1));
  const active = conflicts[idx];
  if (!active) return null;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={theme.warning}>
        {conflicts.length} conflicting file{conflicts.length > 1 ? "s" : ""} · viewing {idx + 1}/
        {conflicts.length}
      </Text>
      <Text color={theme.accent}>── {active.path}</Text>
      {active.participants.map((p) => (
        <Box key={p.agentId} flexDirection="column" marginTop={1}>
          <Text color={theme.accent}>
            {p.agentName}{" "}
            <Text color={theme.muted}>
              ({p.kind} · +{p.additions} -{p.deletions})
            </Text>
          </Text>
          {p.firstHunk ? <Text color={theme.warning}>{p.firstHunk}</Text> : null}
          <Text color={theme.muted}>branch {p.branch}</Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color={theme.muted}>
          press [c] to return to diff view · resolve by reverting one of the conflicting agents
        </Text>
      </Box>
    </Box>
  );
};

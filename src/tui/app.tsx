import { Box, Text, useApp, useInput } from "ink";
import type React from "react";
import { useReducer } from "react";
import { DiffView } from "./diff-view.js";
import { type TuiState, initialState, mapKey, reduce } from "./hotkeys.js";
import { type AgentView, summarizeFiles, summarizeTokens } from "./session.js";
import { theme } from "./styles.js";
import { TabBar } from "./tab-bar.js";

interface AppProps {
  agents: AgentView[];
  /** Used by tests to inspect final state without mounting full TTY. */
  onStateChange?: (state: TuiState) => void;
}

export const App: React.FC<AppProps> = ({ agents, onStateChange }) => {
  const app = useApp();
  const [state, dispatch] = useReducer(reduce, agents.length, initialState);

  useInput((input, key) => {
    const action = mapKey({ input, key: { ...key } });
    if (action.type === "quit") {
      app.exit();
      return;
    }
    dispatch(action);
    if (action.type === "merge") {
      // merge wiring lands in Phase 6; surface intent for now
      process.stderr.write("merge: not implemented yet (Phase 6)\n");
    }
  });

  onStateChange?.(state);

  const decisions = state.decisions;
  const active = agents[state.activeIndex];

  return (
    <Box flexDirection="column">
      <TabBar agents={agents} activeIndex={state.activeIndex} decisions={decisions} />
      {active ? (
        <Box flexDirection="column">
          <Box paddingX={1}>
            <Text color={theme.muted}>
              {summarizeFiles(active)} · {summarizeTokens(active)} · branch{" "}
              {active.report.agent.branch}
            </Text>
          </Box>
          <DiffView report={active.report} scroll={state.scroll} />
        </Box>
      ) : (
        <Box paddingX={1} paddingY={1}>
          <Text color={theme.muted}>
            no subagents yet — wisp-agentdiff records them automatically when Claude Code spawns a
            Task with isolation: worktree.
          </Text>
        </Box>
      )}
      <Box paddingX={1} marginTop={1}>
        <Text color={theme.muted}>
          [a]pprove [r]evert [n]ext [p]rev [c]onflict [m]erge [j/k] scroll [q]uit
        </Text>
      </Box>
    </Box>
  );
};

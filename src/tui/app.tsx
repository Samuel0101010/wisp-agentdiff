import { Box, Text, useApp, useInput } from "ink";
import type React from "react";
import { useCallback, useMemo, useReducer, useState } from "react";
import { type MergeResult, applyApproved } from "../merge/approver.js";
import { detectConflicts } from "../merge/conflict-detector.js";
import { ConflictView } from "./conflict-view.js";
import { DiffView } from "./diff-view.js";
import { type TuiState, initialState, mapKey, reduce } from "./hotkeys.js";
import { type AgentView, summarizeFiles, summarizeTokens } from "./session.js";
import { theme } from "./styles.js";
import { TabBar } from "./tab-bar.js";

interface AppProps {
  agents: AgentView[];
  /** Repo root used for the real merge step. */
  repoRoot?: string;
  /** Used by tests to inspect final state without mounting full TTY. */
  onStateChange?: (state: TuiState) => void;
  /** Override for tests — receives the same args as applyApproved. */
  mergeImpl?: typeof applyApproved;
}

type MergeStatus =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; result: MergeResult }
  | { kind: "error"; message: string };

export const App: React.FC<AppProps> = ({
  agents,
  repoRoot,
  onStateChange,
  mergeImpl = applyApproved,
}) => {
  const app = useApp();
  const [state, dispatch] = useReducer(reduce, agents.length, initialState);
  const [mergeStatus, setMergeStatus] = useState<MergeStatus>({ kind: "idle" });

  const reports = useMemo(() => agents.map((a) => a.report), [agents]);
  const conflicts = useMemo(() => detectConflicts(reports), [reports]);

  const triggerMerge = useCallback(async () => {
    if (!repoRoot) {
      setMergeStatus({ kind: "error", message: "merge unavailable: no repoRoot passed to App" });
      return;
    }
    const approvedIds = new Set<string>();
    agents.forEach((a, i) => {
      if (state.decisions[i] === "approved") approvedIds.add(a.report.agent.id);
    });
    if (approvedIds.size === 0) {
      setMergeStatus({ kind: "error", message: "no agents approved yet" });
      return;
    }
    setMergeStatus({ kind: "running" });
    try {
      const result = await mergeImpl(reports, approvedIds, { repoRoot });
      setMergeStatus({ kind: "done", result });
    } catch (err) {
      setMergeStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [agents, mergeImpl, reports, repoRoot, state.decisions]);

  useInput((input, key) => {
    const action = mapKey({ input, key: { ...key } });
    if (action.type === "quit") {
      app.exit();
      return;
    }
    dispatch(action);
    if (action.type === "merge") void triggerMerge();
  });

  onStateChange?.(state);

  const active = agents[state.activeIndex];
  const conflictsForActive = conflicts.filter((c) =>
    c.participants.some((p) => p.agentId === active?.report.agent.id),
  );

  return (
    <Box flexDirection="column">
      <TabBar agents={agents} activeIndex={state.activeIndex} decisions={state.decisions} />
      {state.mode === "conflict" ? (
        <ConflictView conflicts={conflictsForActive} />
      ) : active ? (
        <Box flexDirection="column">
          <Box paddingX={1}>
            <Text color={theme.muted}>
              {summarizeFiles(active)} · {summarizeTokens(active)} · branch{" "}
              {active.report.agent.branch}
              {conflictsForActive.length > 0 ? (
                <Text color={theme.warning}>
                  {" "}
                  · ⚠ {conflictsForActive.length} conflict
                  {conflictsForActive.length > 1 ? "s" : ""}
                </Text>
              ) : null}
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
      <MergeStatusLine status={mergeStatus} />
      <Box paddingX={1} marginTop={1}>
        <Text color={theme.muted}>
          [a]pprove [r]evert [n]ext [p]rev [c]onflict [m]erge [j/k] scroll [q]uit
        </Text>
      </Box>
    </Box>
  );
};

const MergeStatusLine: React.FC<{ status: MergeStatus }> = ({ status }) => {
  if (status.kind === "idle") return null;
  if (status.kind === "running")
    return (
      <Box paddingX={1}>
        <Text color={theme.warning}>merging approved agents…</Text>
      </Box>
    );
  if (status.kind === "error")
    return (
      <Box paddingX={1}>
        <Text color={theme.removed}>merge error: {status.message}</Text>
      </Box>
    );
  const result = status.result;
  if (result.blockedConflicts.length > 0) {
    return (
      <Box paddingX={1}>
        <Text color={theme.removed}>
          merge blocked — {result.blockedConflicts.length} approved-vs-approved file
          {result.blockedConflicts.length > 1 ? "s" : ""} conflict. Revert one of the colliding
          agents and try again.
        </Text>
      </Box>
    );
  }
  const merged = result.merged.filter((m) => m.status === "merged").length;
  const failed = result.merged.find((m) => m.status === "failed");
  return (
    <Box paddingX={1}>
      {failed ? (
        <Text color={theme.removed}>
          merge halted on {failed.agentName}: {failed.message}
        </Text>
      ) : (
        <Text color={theme.added}>
          merged {merged} agent{merged === 1 ? "" : "s"} into HEAD
        </Text>
      )}
    </Box>
  );
};

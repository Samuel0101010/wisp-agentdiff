import type { AgentReport } from "../collect/token-tracker.js";
import { buildAgentReport } from "../collect/token-tracker.js";
import { loadState } from "../wrap/state.js";
import type { DecisionState } from "./styles.js";

export interface AgentView {
  report: AgentReport;
  decision: DecisionState;
}

export async function loadSession(repoRoot: string): Promise<AgentView[]> {
  const state = loadState(repoRoot);
  const reports = await Promise.all(state.agents.map((a) => buildAgentReport(a)));
  return reports.map((report) => ({ report, decision: "pending" as DecisionState }));
}

export function summarizeFiles(view: AgentView): string {
  const { totals } = view.report.diff;
  return `${totals.files} files  +${totals.additions} -${totals.deletions}`;
}

export function summarizeTokens(view: AgentView): string {
  const t = view.report.transcript;
  if (t.totalTokens === 0 && t.totalToolCalls === 0) return "no transcript";
  const tk = t.totalTokens.toLocaleString();
  return `${tk} tok  ${t.totalToolCalls} tools`;
}

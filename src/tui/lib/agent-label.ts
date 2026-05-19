import type { AgentRecord } from "../../wrap/state.js";

/**
 * Pick the user-visible label for an agent. Prefers the correlated
 * `displayLabel` (e.g. `wisp-self-test`) from `PreToolUse:Task`, but falls back
 * to the raw worktree `name` when the label is missing, empty, or whitespace.
 */
export function agentLabel(agent: AgentRecord): string {
  const label = agent.displayLabel?.trim();
  return label && label.length > 0 ? label : agent.name;
}

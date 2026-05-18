import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface AgentRecord {
  id: string;
  name: string;
  path: string;
  branch: string;
  baseRef: string;
  createdAt: string;
  completedAt?: string;
  diffPath?: string;
  transcriptPath?: string;
  status: "running" | "completed" | "captured" | "removed";
}

export interface State {
  version: 1;
  sessionStartedAt: string;
  repoRoot: string;
  agents: AgentRecord[];
}

const STATE_FILE = ".claude/wisp-agentdiff-state.json";

export function stateFilePath(repoRoot: string): string {
  return resolve(repoRoot, STATE_FILE);
}

export function loadState(repoRoot: string): State {
  const file = stateFilePath(repoRoot);
  if (!existsSync(file)) {
    return {
      version: 1,
      sessionStartedAt: new Date().toISOString(),
      repoRoot,
      agents: [],
    };
  }
  const raw = readFileSync(file, "utf8");
  return JSON.parse(raw) as State;
}

export function saveState(repoRoot: string, state: State): void {
  const file = stateFilePath(repoRoot);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
}

export function upsertAgent(state: State, agent: AgentRecord): State {
  const idx = state.agents.findIndex((a) => a.id === agent.id);
  const next = { ...state, agents: [...state.agents] };
  if (idx >= 0) {
    next.agents[idx] = agent;
  } else {
    next.agents.push(agent);
  }
  return next;
}

export function findAgentByName(state: State, name: string): AgentRecord | undefined {
  return state.agents.find((a) => a.name === name);
}

export function diffStoragePath(repoRoot: string, agentId: string): string {
  return join(repoRoot, ".claude", "wisp-agentdiff", "diffs", `${agentId}.json`);
}

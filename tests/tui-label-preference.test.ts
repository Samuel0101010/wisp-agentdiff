import { describe, expect, it } from "vitest";
import { agentLabel } from "../src/tui/lib/agent-label.js";
import type { AgentRecord } from "../src/wrap/state.js";

function makeAgent(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: "id-x",
    name: "agent-a4925f3562a8b0c25",
    path: "/tmp/x",
    branch: "wisp-agentdiff/agent-x",
    baseRef: "HEAD",
    createdAt: "2026-05-18T00:00:00Z",
    status: "captured",
    ...overrides,
  };
}

describe("agentLabel", () => {
  it("returns displayLabel when it is a non-empty string", () => {
    const agent = makeAgent({ displayLabel: "wisp-self-test" });
    expect(agentLabel(agent)).toBe("wisp-self-test");
  });

  it("falls back to name when displayLabel is undefined", () => {
    const agent = makeAgent({ displayLabel: undefined });
    expect(agentLabel(agent)).toBe(agent.name);
  });

  it("falls back to name when displayLabel is an empty string", () => {
    const agent = makeAgent({ displayLabel: "" });
    expect(agentLabel(agent)).toBe(agent.name);
  });

  it("falls back to name when displayLabel is whitespace-only", () => {
    const agent = makeAgent({ displayLabel: "   " });
    expect(agentLabel(agent)).toBe(agent.name);
  });

  it("prefers displayLabel over name when both are set", () => {
    const agent = makeAgent({ name: "agent-deadbeef", displayLabel: "wisp-self-test" });
    expect(agentLabel(agent)).toBe("wisp-self-test");
  });
});

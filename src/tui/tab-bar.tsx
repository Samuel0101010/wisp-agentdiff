import { Box, Text } from "ink";
import type React from "react";
import { agentLabel } from "./lib/agent-label.js";
import type { AgentView } from "./session.js";
import { decisionColor, decisionGlyph, theme } from "./styles.js";

interface TabBarProps {
  agents: AgentView[];
  activeIndex: number;
  decisions: AgentView["decision"][];
}

export const TabBar: React.FC<TabBarProps> = ({ agents, activeIndex, decisions }) => (
  <Box flexDirection="row" borderStyle="round" borderColor={theme.accent} paddingX={1}>
    {agents.length === 0 ? (
      <Text color={theme.muted}>no subagents recorded — run a Task first</Text>
    ) : (
      agents.map((a, i) => {
        const active = i === activeIndex;
        const decision = decisions[i] ?? "pending";
        return (
          <Box key={a.report.agent.id} marginRight={2}>
            <Text color={active ? theme.accent : theme.muted}>
              {active ? "▍" : " "}
              {i + 1}.
            </Text>
            <Text color={active ? "white" : theme.muted} bold={active}>
              {" "}
              {agentLabel(a.report.agent)}{" "}
            </Text>
            <Text color={decisionColor[decision]}>{decisionGlyph[decision]}</Text>
          </Box>
        );
      })
    )}
  </Box>
);

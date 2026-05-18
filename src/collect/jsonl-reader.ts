import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";

/**
 * Subagent JSONL transcript summary. We aggregate liberally because schema
 * shifts between Claude Code releases — fields are optional everywhere.
 */
export interface TranscriptSummary {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  toolUses: Map<string, number>;
  totalToolCalls: number;
  durationMs: number;
  messageCount: number;
  /** First model name encountered. */
  model?: string;
  /** Final agent result text if present. */
  result?: string;
}

interface UsageBlock {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export function emptySummary(): TranscriptSummary {
  return {
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    toolUses: new Map(),
    totalToolCalls: 0,
    durationMs: 0,
    messageCount: 0,
  };
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/**
 * Pull tool-use names + usage stats from a single JSONL line.
 * Robust to events with: tool_uses[], message.content[].type="tool_use",
 * or a flat tool_use_name. Schema may shift across CC versions.
 */
export function digestEvent(event: unknown, into: TranscriptSummary): void {
  if (!event || typeof event !== "object") return;
  const e = event as Record<string, unknown>;
  into.messageCount++;

  if (typeof e.model === "string" && !into.model) into.model = e.model;

  const usage = (e.usage ?? (e.message as Record<string, unknown> | undefined)?.usage) as
    | UsageBlock
    | undefined;
  if (usage) {
    into.inputTokens += usage.input_tokens ?? 0;
    into.outputTokens += usage.output_tokens ?? 0;
    into.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
    into.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;
    into.totalTokens +=
      usage.total_tokens ?? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
  }

  if (typeof e.duration_ms === "number") into.durationMs += e.duration_ms;

  const toolUses = e.tool_uses;
  if (Array.isArray(toolUses)) {
    for (const t of toolUses) {
      if (typeof t === "string") bump(into.toolUses, t);
      else if (t && typeof t === "object" && typeof (t as { name?: unknown }).name === "string") {
        bump(into.toolUses, (t as { name: string }).name);
      }
      into.totalToolCalls++;
    }
  }
  if (typeof e.tool_use_name === "string") {
    bump(into.toolUses, e.tool_use_name);
    into.totalToolCalls++;
  }

  const content = (e.message as Record<string, unknown> | undefined)?.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part && typeof part === "object") {
        const p = part as { type?: string; name?: string };
        if (p.type === "tool_use" && typeof p.name === "string") {
          bump(into.toolUses, p.name);
          into.totalToolCalls++;
        }
      }
    }
  }

  if (typeof e.result === "string" && !into.result) into.result = e.result;
}

export async function readTranscript(filePath: string): Promise<TranscriptSummary> {
  const summary = emptySummary();
  if (!existsSync(filePath)) return summary;

  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });
  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const event = JSON.parse(line);
      digestEvent(event, summary);
    } catch {
      // ignore malformed line — transcripts can be partial
    }
  }
  return summary;
}

export function summarizeJsonlText(text: string): TranscriptSummary {
  const summary = emptySummary();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    try {
      digestEvent(JSON.parse(line), summary);
    } catch {
      // skip
    }
  }
  return summary;
}

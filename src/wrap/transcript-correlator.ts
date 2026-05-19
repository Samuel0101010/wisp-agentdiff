import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { hasSeenToolUseId, loadPending, savePending } from "./pending-tasks.js";

/**
 * Replacement for the v1.2.x PreToolUse:Task path. The `WorktreeCreate` hook
 * payload now carries `transcript_path`; we stream the session JSONL, pick up
 * every Task tool_use we haven't already drained, and enqueue them in order.
 *
 * Idempotent: each tool_use_id is tracked once (in either `tasks` or
 * `consumed`) so re-running on the same transcript is a no-op.
 */
export interface IngestOpts {
  now?: () => Date;
}

interface ToolUsePart {
  type?: string;
  name?: string;
  id?: string;
  input?: { subagent_type?: string; description?: string };
}

export async function ingestTranscriptTasks(
  repoRoot: string,
  transcriptPath: string,
  opts: IngestOpts = {},
): Promise<number> {
  if (!existsSync(transcriptPath)) return 0;
  const now = opts.now ?? (() => new Date());

  const state = loadPending(repoRoot);
  const stream = createReadStream(transcriptPath, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });

  let added = 0;
  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) continue;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (!event || typeof event !== "object") continue;
    const e = event as { type?: string; message?: { content?: unknown } };
    if (e.type !== "assistant") continue;
    const content = e.message?.content;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const p = part as ToolUsePart;
      // Claude Code v2.1+ writes the subagent-dispatch tool_use as
      // `name: "Agent"`; older builds called it `"Task"`. Accept both.
      if (p.type !== "tool_use" || (p.name !== "Task" && p.name !== "Agent")) continue;
      const id = typeof p.id === "string" ? p.id : "";
      const subagentType = typeof p.input?.subagent_type === "string" ? p.input.subagent_type : "";
      if (!id || !subagentType) continue;
      if (hasSeenToolUseId(state, id)) continue;

      const task = {
        subagentType,
        ...(typeof p.input?.description === "string" ? { description: p.input.description } : {}),
        toolUseId: id,
        queuedAt: now().toISOString(),
      };
      state.tasks.push(task);
      added++;
    }
  }

  if (added > 0) savePending(repoRoot, state);
  return added;
}

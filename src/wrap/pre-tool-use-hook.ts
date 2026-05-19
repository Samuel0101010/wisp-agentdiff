import { logHookEvent } from "./debug-log.js";
import { enqueueTask } from "./pending-tasks.js";

/**
 * Native Claude Code PreToolUse hook payload (stdin JSON).
 * We only care about the `Task` matcher — that's the tool that spawns
 * subagents and is what gives us the human-readable `subagent_type`.
 */
export interface PreToolUsePayload {
  tool_name?: string;
  tool_input?: {
    subagent_type?: string;
    description?: string;
    prompt?: string;
  };
}

export interface PreToolUseDeps {
  repoRoot: string;
  now?: () => Date;
}

export function handlePreToolUse(payload: PreToolUsePayload, deps: PreToolUseDeps): void {
  try {
    if (!payload || typeof payload !== "object") return;
    if (payload.tool_name !== "Task") return;

    const input = payload.tool_input;
    const subagentType = input?.subagent_type;
    if (typeof subagentType !== "string" || subagentType.length === 0) return;

    const now = deps.now ?? (() => new Date());
    const description =
      typeof input?.description === "string" && input.description.length > 0
        ? input.description
        : undefined;

    const task = {
      subagentType,
      ...(description !== undefined ? { description } : {}),
      queuedAt: now().toISOString(),
    };

    enqueueTask(deps.repoRoot, task);
    logHookEvent(deps.repoRoot, "pre-tool-use.queued", {
      subagentType,
      hasDescription: description !== undefined,
    });
  } catch {
    // PreToolUse must never block tool execution — swallow everything.
  }
}

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

/**
 * Persistent hook diagnostic log under `.claude/wisp-agentdiff/debug.log`.
 *
 * Always written (cheap append) so end-to-end failures can be diagnosed
 * after the fact without having to re-run with WISP_DEBUG=1 set. Rotated
 * by truncation when it exceeds ~64 KiB.
 */
const MAX_LOG_BYTES = 64 * 1024;

function debugLogPath(repoRoot: string): string {
  return join(repoRoot, ".claude", "wisp-agentdiff", "debug.log");
}

export function logHookEvent(repoRoot: string, event: string, data: Record<string, unknown>): void {
  try {
    const path = debugLogPath(repoRoot);
    mkdirSync(dirname(path), { recursive: true });
    const line = `${new Date().toISOString()}  ${event}  ${JSON.stringify(data)}\n`;
    if (existsSync(path)) {
      // Soft rotation: if file is getting big, drop the head before appending
      try {
        const size = statSync(path).size;
        if (size > MAX_LOG_BYTES) {
          const buf = readFileSync(path);
          const keep = buf.subarray(buf.length - Math.floor(MAX_LOG_BYTES / 2));
          writeFileSync(path, keep);
        }
      } catch {
        // rotation is best-effort; never let logging crash a hook
      }
    }
    appendFileSync(path, line, "utf8");
  } catch {
    // logging must never propagate failure to the hook
  }
}

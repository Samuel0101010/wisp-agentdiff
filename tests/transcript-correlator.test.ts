import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadPending } from "../src/wrap/pending-tasks.js";
import { ingestTranscriptTasks } from "../src/wrap/transcript-correlator.js";

const FIXTURE = resolve(__dirname, "fixtures", "transcript-with-tasks.jsonl");

describe("ingestTranscriptTasks", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "wisp-transcript-"));
  });
  afterEach(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("queues every Task tool_use in transcript order", async () => {
    const added = await ingestTranscriptTasks(root, FIXTURE);
    expect(added).toBe(3);
    const tasks = loadPending(root).tasks;
    expect(tasks.map((t) => t.subagentType)).toEqual(["alpha", "beta", "gamma"]);
    expect(tasks.map((t) => t.toolUseId)).toEqual(["toolu_a", "toolu_b", "toolu_c"]);
    expect(tasks[0]?.description).toBe("alpha work");
  });

  it("re-ingesting the same transcript adds nothing (idempotent)", async () => {
    const first = await ingestTranscriptTasks(root, FIXTURE);
    expect(first).toBe(3);
    const second = await ingestTranscriptTasks(root, FIXTURE);
    expect(second).toBe(0);
    expect(loadPending(root).tasks).toHaveLength(3);
  });

  it("skips malformed JSON lines but keeps reading", async () => {
    const file = join(root, "noisy.jsonl");
    writeFileSync(
      file,
      [
        "{not json",
        '{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","name":"Task","id":"toolu_x","input":{"subagent_type":"delta"}}]}}',
        "",
        "garbage",
        '{"type":"result","result":"ok"}',
      ].join("\n"),
      "utf8",
    );
    const added = await ingestTranscriptTasks(root, file);
    expect(added).toBe(1);
    expect(loadPending(root).tasks[0]?.subagentType).toBe("delta");
  });

  it("returns 0 when transcript file is missing", async () => {
    const added = await ingestTranscriptTasks(root, join(root, "nope.jsonl"));
    expect(added).toBe(0);
  });

  it("ignores assistant messages with only text content", async () => {
    const file = join(root, "text-only.jsonl");
    writeFileSync(
      file,
      [
        '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hi"}]}}',
      ].join("\n"),
      "utf8",
    );
    const added = await ingestTranscriptTasks(root, file);
    expect(added).toBe(0);
  });

  it("ignores tool_uses for tools other than Task", async () => {
    const file = join(root, "other-tools.jsonl");
    writeFileSync(
      file,
      [
        '{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","name":"Read","id":"toolu_r","input":{}},{"type":"tool_use","name":"Bash","id":"toolu_b","input":{"command":"ls"}}]}}',
      ].join("\n"),
      "utf8",
    );
    const added = await ingestTranscriptTasks(root, file);
    expect(added).toBe(0);
    expect(loadPending(root).tasks).toHaveLength(0);
  });

  it("skips Task entries missing subagent_type or id", async () => {
    const file = join(root, "partial.jsonl");
    writeFileSync(
      file,
      [
        '{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","name":"Task","id":"","input":{"subagent_type":"x"}},{"type":"tool_use","name":"Task","id":"toolu_y","input":{}}]}}',
      ].join("\n"),
      "utf8",
    );
    const added = await ingestTranscriptTasks(root, file);
    expect(added).toBe(0);
  });
});

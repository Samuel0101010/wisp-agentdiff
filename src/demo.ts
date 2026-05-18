import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { State } from "./wrap/state.js";
import { diffStoragePath, saveState } from "./wrap/state.js";

/**
 * Seed a synthetic per-agent review session so the TUI has realistic data
 * to render for the demo GIF. Writes to .claude/wisp-agentdiff-state.json
 * and .claude/wisp-agentdiff/diffs/<id>.json, then exits.
 *
 * Five agents — auth, api, db, tests, docs — modelled after the README
 * narrative. `db` carries the "rogue agent" file that overlaps with `api`.
 */

interface DemoAgent {
  id: string;
  name: string;
  baseRef: string;
  diff: string;
  filesChanged: number;
}

const DEMO_AGENTS: DemoAgent[] = [
  {
    id: "demo-auth",
    name: "auth",
    baseRef: "deadbeef0001",
    filesChanged: 2,
    diff: `diff --git a/src/auth/session.ts b/src/auth/session.ts
index 1111111..2222222 100644
--- a/src/auth/session.ts
+++ b/src/auth/session.ts
@@ -1,5 +1,9 @@
 export interface Session {
   id: string;
+  userId: string;
+  createdAt: Date;
+  expiresAt: Date;
 }
+
+export function rotateToken(s: Session): Session { return { ...s }; }
diff --git a/src/auth/middleware.ts b/src/auth/middleware.ts
index 3333333..4444444 100644
--- a/src/auth/middleware.ts
+++ b/src/auth/middleware.ts
@@ -8,7 +8,7 @@ export function requireAuth(req: Req) {
-  if (!req.session) throw new Error("no session");
+  if (!req.session || isExpired(req.session)) throw new Unauthorized();
   return req.session;
 }
`,
  },
  {
    id: "demo-api",
    name: "api",
    baseRef: "deadbeef0001",
    filesChanged: 3,
    diff: `diff --git a/src/api/routes.ts b/src/api/routes.ts
index aaaa..bbbb 100644
--- a/src/api/routes.ts
+++ b/src/api/routes.ts
@@ -12,6 +12,12 @@ export function register(app: App) {
   app.get("/users/:id", getUser);
   app.post("/users", createUser);
+  app.patch("/users/:id", patchUser);
+  app.delete("/users/:id", deleteUser);
 }
diff --git a/src/db/pool.ts b/src/db/pool.ts
index cccc..dddd 100644
--- a/src/db/pool.ts
+++ b/src/db/pool.ts
@@ -22,7 +22,9 @@ export class Pool {
   constructor(opts: Opts) {
     this.url = opts.url;
+    this.retries = opts.retries ?? 3;
+    this.timeoutMs = opts.timeoutMs ?? 5000;
     this.client = makeClient(opts);
   }
`,
  },
  {
    id: "demo-db",
    name: "db",
    baseRef: "deadbeef0001",
    filesChanged: 4,
    diff: `diff --git a/src/db/pool.ts b/src/db/pool.ts
index cccc..eeee 100644
--- a/src/db/pool.ts
+++ b/src/db/pool.ts
@@ -1,20 +1,40 @@
-export class Pool {
+// Complete rewrite — switched to a custom retry loop
+// and removed timeout config. (this is the rogue agent.)
+export class Pool {
   constructor(opts: Opts) {
-    this.url = opts.url;
-    this.client = makeClient(opts);
+    this.url = String(opts.url);
+    this.client = unsafeMakeClient(opts);
   }
+  query(sql: string) { /* retry loop, no timeout */ }
+}
+function unsafeMakeClient(_: Opts) { return null as any; }
diff --git a/src/db/session.ts b/src/db/session.ts
index 5555..6666 100644
--- a/src/db/session.ts
+++ b/src/db/session.ts
@@ -3,6 +3,7 @@ export function open(pool: Pool): Session {
   return {
     id: nanoid(),
+    createdAt: new Date(),
     pool,
   };
 }
`,
  },
  {
    id: "demo-tests",
    name: "tests",
    baseRef: "deadbeef0001",
    filesChanged: 2,
    diff: `diff --git a/tests/auth.test.ts b/tests/auth.test.ts
new file mode 100644
index 0000000..7777777
--- /dev/null
+++ b/tests/auth.test.ts
@@ -0,0 +1,12 @@
+import { describe, expect, it } from "vitest";
+import { rotateToken } from "../src/auth/session.js";
+describe("rotateToken", () => {
+  it("preserves id", () => {
+    expect(rotateToken({ id: "x" } as any).id).toBe("x");
+  });
+});
diff --git a/tests/api.test.ts b/tests/api.test.ts
new file mode 100644
index 0000000..8888888
--- /dev/null
+++ b/tests/api.test.ts
@@ -0,0 +1,8 @@
+import { expect, it } from "vitest";
+it("registers all routes", () => { expect(true).toBe(true); });
`,
  },
  {
    id: "demo-docs",
    name: "docs",
    baseRef: "deadbeef0001",
    filesChanged: 1,
    diff: `diff --git a/docs/auth.md b/docs/auth.md
new file mode 100644
index 0000000..9999999
--- /dev/null
+++ b/docs/auth.md
@@ -0,0 +1,18 @@
+# Authentication
+
+Sessions are short-lived and rotated on every privileged action.
+
+## Endpoints
+
+| Method | Path | Note |
+|--------|------|------|
+| POST   | /login | issues a session |
+| POST   | /logout | revokes it |
+| PATCH  | /session | rotates the token |
`,
  },
];

export function seedDemo(repoRoot: string): void {
  const now = new Date("2026-05-18T20:00:00Z");

  const state: State = {
    version: 1,
    sessionStartedAt: now.toISOString(),
    repoRoot,
    agents: [],
  };

  for (const agent of DEMO_AGENTS) {
    const diffPath = diffStoragePath(repoRoot, agent.id);
    mkdirSync(dirname(diffPath), { recursive: true });
    writeFileSync(
      diffPath,
      JSON.stringify(
        {
          agentId: agent.id,
          branch: `wisp-agentdiff/agent-${agent.name}`,
          baseRef: agent.baseRef,
          capturedAt: now.toISOString(),
          unified: agent.diff,
          nameStatus: "",
        },
        null,
        2,
      ),
      "utf8",
    );

    state.agents.push({
      id: agent.id,
      name: agent.name,
      path: join(repoRoot, ".claude", "worktrees", "wisp-agentdiff", agent.name),
      branch: `wisp-agentdiff/agent-${agent.name}`,
      baseRef: agent.baseRef,
      createdAt: now.toISOString(),
      completedAt: now.toISOString(),
      diffPath,
      status: "captured",
    });
  }

  saveState(repoRoot, state);
}

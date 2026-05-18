import { render } from "ink";
import React from "react";
import { App } from "./app.js";
import { loadSession } from "./session.js";

export interface RunOptions {
  repoRoot: string;
}

export async function runReviewTui(options: RunOptions): Promise<void> {
  const agents = await loadSession(options.repoRoot);
  const instance = render(React.createElement(App, { agents, repoRoot: options.repoRoot }));
  await instance.waitUntilExit();
}

import type { DecisionState } from "./styles.js";

export type HotkeyAction =
  | { type: "noop" }
  | { type: "next" }
  | { type: "prev" }
  | { type: "approve" }
  | { type: "revert" }
  | { type: "toggle-conflict" }
  | { type: "merge" }
  | { type: "scroll"; delta: number }
  | { type: "quit" };

export interface KeyEvent {
  input: string;
  key: { leftArrow?: boolean; rightArrow?: boolean; upArrow?: boolean; downArrow?: boolean };
}

/**
 * Pure key-mapper. Tests drive it directly without rendering Ink.
 * Single-letter verbs from the research synthesis (tazuna + plural).
 */
export function mapKey(event: KeyEvent): HotkeyAction {
  const { input, key } = event;
  if (key.leftArrow) return { type: "prev" };
  if (key.rightArrow) return { type: "next" };
  if (key.upArrow) return { type: "scroll", delta: -1 };
  if (key.downArrow) return { type: "scroll", delta: 1 };

  switch (input) {
    case "n":
      return { type: "next" };
    case "p":
      return { type: "prev" };
    case "a":
      return { type: "approve" };
    case "r":
      return { type: "revert" };
    case "c":
      return { type: "toggle-conflict" };
    case "m":
      return { type: "merge" };
    case "j":
      return { type: "scroll", delta: 1 };
    case "k":
      return { type: "scroll", delta: -1 };
    case "q":
      return { type: "quit" };
    default:
      return { type: "noop" };
  }
}

export interface TuiState {
  activeIndex: number;
  decisions: DecisionState[];
  scroll: number;
  mode: "diff" | "conflict";
  shouldExit: boolean;
}

export function initialState(agentCount: number): TuiState {
  return {
    activeIndex: 0,
    decisions: new Array<DecisionState>(agentCount).fill("pending"),
    scroll: 0,
    mode: "diff",
    shouldExit: false,
  };
}

export function reduce(state: TuiState, action: HotkeyAction): TuiState {
  const total = state.decisions.length;
  switch (action.type) {
    case "next":
      if (total === 0) return state;
      return { ...state, activeIndex: (state.activeIndex + 1) % total, scroll: 0 };
    case "prev":
      if (total === 0) return state;
      return { ...state, activeIndex: (state.activeIndex - 1 + total) % total, scroll: 0 };
    case "approve":
      return setDecision(state, "approved");
    case "revert":
      return setDecision(state, "reverted");
    case "toggle-conflict":
      return { ...state, mode: state.mode === "conflict" ? "diff" : "conflict" };
    case "merge":
      // merge action is dispatched to caller; reducer only acknowledges intent.
      return state;
    case "scroll":
      return { ...state, scroll: Math.max(0, state.scroll + action.delta) };
    case "quit":
      return { ...state, shouldExit: true };
    default:
      return state;
  }
}

function setDecision(state: TuiState, decision: DecisionState): TuiState {
  if (state.decisions.length === 0) return state;
  const next = state.decisions.slice();
  next[state.activeIndex] = decision;
  // auto-advance after a decision so the user keeps moving forward
  const advanced = state.activeIndex + 1 < next.length ? state.activeIndex + 1 : state.activeIndex;
  return { ...state, decisions: next, activeIndex: advanced, scroll: 0 };
}

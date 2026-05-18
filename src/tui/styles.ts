/**
 * Three-color theme — kept intentionally minimal so demo GIFs stay readable.
 * - accent: tab/active indicators
 * - added/removed: diff line tinting
 * Everything else inherits the terminal foreground.
 */
export const theme = {
  accent: "cyan",
  added: "green",
  removed: "red",
  warning: "yellow",
  muted: "gray",
} as const;

export type DecisionState = "pending" | "approved" | "reverted";

export const decisionGlyph: Record<DecisionState, string> = {
  pending: "·",
  approved: "✓",
  reverted: "✗",
};

export const decisionColor: Record<DecisionState, string> = {
  pending: theme.muted,
  approved: theme.added,
  reverted: theme.removed,
};

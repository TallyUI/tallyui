// Ported from WCPOS v2 packages/core/src/screens/main/pos/cart/cells/line-strip.geometry.ts (the release rule only); MIT, WCPOS.

/**
 * The remove point as a share of the row. Material and Wear commit at a half; our strip
 * already covers 42–47 % of a register column, so a half would leave almost no band between
 * "open" and "remove".
 */
export const REMOVE_SHARE = 0.6;
/** The band is never narrower than this past the open strip, whatever the row width. */
export const REMOVE_BAND = 56;
/** A flick this fast (px/s, leftwards) past the open strip removes without reaching the line. */
export const REMOVE_FLICK = 800;

/** How far the row has to travel before letting go removes it. */
export function removePoint(rowWidth: number, stripWidth: number): number {
  return Math.max(stripWidth + REMOVE_BAND, Math.round(rowWidth * REMOVE_SHARE));
}

export type Release = 'remove' | 'open' | 'home';

/** `revealed` is how far left the row sits (a positive number), `velocityX` the gesture's, leftwards negative. */
export function releaseOutcome({ revealed, velocityX, rowWidth, stripWidth }: {
  revealed: number; velocityX: number; rowWidth: number; stripWidth: number;
}): Release {
  if (revealed >= removePoint(rowWidth, stripWidth)) return 'remove';
  if (velocityX <= -REMOVE_FLICK && revealed > stripWidth) return 'remove';
  return revealed > stripWidth / 2 ? 'open' : 'home';
}

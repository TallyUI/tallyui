// Outbox retry defaults: the first retry waits about this long, doubling after each failure up to the cap.
export const DEFAULT_INITIAL_BACKOFF_MS = 1000;
export const DEFAULT_MAX_BACKOFF_MS = 60_000;

/** The wait before a retry: `backoff` with ±10 % jitter, never shorter than the store's Retry-After, never longer than `maxBackoff`. */
export function retryDelay(backoff: number, retryAfterMs: number, maxBackoff: number, random: () => number): number {
  return Math.min(Math.max(retryAfterMs, backoff * (0.9 + 0.2 * random())), maxBackoff);
}

import type { AnyCommandEnvelope, CommandEnvelope, CommandResult, OrderCreatePayload } from '@tallyui/core';

export type TransportOutcome =
  | { kind: 'results'; results: CommandResult[] }
  | { kind: 'unauthorized' }
  | { kind: 'refused'; status: number; reason: string }
  | { kind: 'retry'; reason: string; retryAfterMs?: number };

export interface CommandTransport<E extends AnyCommandEnvelope = CommandEnvelope<OrderCreatePayload>> {
  send(batch: E[]): Promise<TransportOutcome>;
}

export interface OutboxState {
  pending: number;
  sending: boolean;
  lastRetryReason?: string;
  nextAttemptAt?: number;
  /** Set after 3 consecutive 401s; the app should ask the cashier to sign in, then call flush(). */
  authRequired?: boolean;
  /** Set when the server refused a whole batch (HTTP 400, 403, 413, 415, 422). No order is changed; sending pauses until the next flush(). */
  refused?: { status: number; reason: string };
  /** Set while the store (not offline) has kept failing some orders for 15 minutes, each on its own clock. Those
   * orders stay pending and keep retrying. `orders` has each order's own entry: its `since` is when its clock
   * would have started had there been no offline gaps (now minus its answered time; while offline, as of the
   * moment the clock paused), and its latest `reason`. `since` is the earliest of theirs; `reason` the latest. */
  stuck?: { commandIds: string[]; since: number; reason: string; orders: { commandId: string; since: number; reason: string }[] };
}

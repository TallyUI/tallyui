import type { CommandEnvelope, CommandResult, OrderCreatePayload } from '@tallyui/core';

export type TransportOutcome =
  | { kind: 'results'; results: CommandResult[] }
  | { kind: 'unauthorized' }
  | { kind: 'refused'; status: number; reason: string }
  | { kind: 'retry'; reason: string; retryAfterMs?: number };

export interface CommandTransport {
  send(batch: CommandEnvelope<OrderCreatePayload>[]): Promise<TransportOutcome>;
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
}

import type { CommandEnvelope, CommandResult, OrderCreatePayload } from '@tallyui/core';

export type TransportOutcome =
  | { kind: 'results'; results: CommandResult[] }
  | { kind: 'retry'; reason: string; retryAfterMs?: number };

export interface CommandTransport {
  send(batch: CommandEnvelope<OrderCreatePayload>[]): Promise<TransportOutcome>;
}

export interface OutboxState {
  pending: number;
  sending: boolean;
  lastRetryReason?: string;
  nextAttemptAt?: number;
}

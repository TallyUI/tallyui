import type { CommandError, OrderReopenEnvelope, OrderReopenResult } from '@tallyui/core';
import { parseCommandResult } from '@tallyui/core';
import type { CommandTransport } from '../outbox/types';

export type OrderReopenOutcome =
  | { kind: 'applied'; reopen: OrderReopenResult; duplicate: boolean }
  | { kind: 'rejected'; error: CommandError }
  | { kind: 'unknown'; reason: string; retryAfterMs?: number }
  | { kind: 'refused'; status: number; reason: string }
  | { kind: 'unauthorized' }
  | { kind: 'in_flight' };

const inFlight = new Set<string>();

/** Online only, never queued (ADR-090). On unknown, resend the same envelope (same id); after rejected, a new attempt needs a new id.
 * At most one reopen per order is in flight; a second gets in_flight without a send. */
export async function sendOrderReopen(
  transport: CommandTransport<OrderReopenEnvelope>, envelope: OrderReopenEnvelope,
): Promise<OrderReopenOutcome> {
  const orderId = envelope.payload.orderId;
  if (inFlight.has(orderId)) return { kind: 'in_flight' };
  inFlight.add(orderId);
  try {
    let outcome;
    try {
      outcome = await transport.send([envelope]);
    } catch {
      return { kind: 'unknown', reason: 'transport_error' };
    }
    if (outcome.kind === 'retry') {
      return {
        kind: 'unknown', reason: outcome.reason,
        ...(outcome.retryAfterMs !== undefined ? { retryAfterMs: outcome.retryAfterMs } : {}),
      };
    }
    if (outcome.kind === 'refused' || outcome.kind === 'unauthorized') return outcome;
    const matches = outcome.results.filter((result) => result.id === envelope.id);
    if (matches.length !== 1) return { kind: 'unknown', reason: 'missing_result' };
    let result;
    try {
      result = parseCommandResult(matches[0]);
    } catch {
      return { kind: 'unknown', reason: 'bad_result' };
    }
    if (result.status === 'applied' || result.status === 'duplicate') {
      if (!result.reopen) return { kind: 'unknown', reason: 'bad_result' };
      return { kind: 'applied', reopen: result.reopen, duplicate: result.status === 'duplicate' };
    }
    return { kind: 'rejected', error: result.error! };
  } finally {
    inFlight.delete(orderId);
  }
}

export function isOrderReopenInFlight(orderId: string): boolean { return inFlight.has(orderId); }

/** Re-open is offered only when the store lists order.reopen, the till is online, storage is not degraded and no reopen of the order is in flight (ADR-090 decision 2). */
export function isReopenOffered(input: { orderReopen?: number; online: boolean; storageDegraded: boolean; orderId: string }): boolean {
  return (input.orderReopen ?? 0) >= 1 && input.online && !input.storageDegraded && !isOrderReopenInFlight(input.orderId);
}

import type { CommandError, OrderRefundEnvelope, OrderRefundResult } from '@tallyui/core';
import { parseCommandResult } from '@tallyui/core';
import type { CommandTransport } from '../outbox/types';

export type OrderRefundOutcome =
  | { kind: 'applied'; refund: OrderRefundResult; duplicate: boolean }
  | { kind: 'rejected'; error: CommandError }
  | { kind: 'unknown'; reason: string; retryAfterMs?: number }
  | { kind: 'refused'; status: number; reason: string }
  | { kind: 'unauthorized' };

/** Online only, never queued (ADR-080). On unknown, resend the same envelope (same id).
 * After rejected, a new attempt needs a new id. Refused and unauthorized mean the store did not take the batch. */
export async function sendOrderRefund(
  transport: CommandTransport<OrderRefundEnvelope>, envelope: OrderRefundEnvelope,
): Promise<OrderRefundOutcome> {
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
    if (!result.refund) return { kind: 'unknown', reason: 'bad_result' };
    return { kind: 'applied', refund: result.refund, duplicate: result.status === 'duplicate' };
  }
  return { kind: 'rejected', error: result.error! };
}

import { knownWarnings } from '@tallyui/core';
import { isReopened } from './reopened';
import type { PosOrder } from './types';

/**
 * The orders a cashier must look at: rejected, applied with a known warning, taken after their
 * session closed (`lateSessionId`) or with local warnings (whatever the sync status), or pending with a `commandId` in
 * `stuckCommandIds` (the outbox's `OutboxState.stuck`: the store keeps failing it), newest first.
 * A warning code this till version doesn't know is not shown here (`knownWarnings`). Never changes `orders`.
 * `register_session_unknown` is not shown, because the store counts the order once its session arrives (ADR-078).
 * Reopened refused orders are left out, whatever else they carry.
 */
export function needsAttention(orders: PosOrder[], options: { stuckCommandIds?: readonly string[] } = {}): PosOrder[] {
  return orders.filter((order) => order.syncStatus === 'rejected'
    || (order.localWarnings?.length ?? 0) > 0
    || (order.syncStatus === 'applied' && knownWarnings(order.warnings).some((warning) => warning.code !== 'register_session_unknown')) || order.lateSessionId !== undefined
    || (order.syncStatus === 'pending' && options.stuckCommandIds?.includes(order.commandId) === true))
    .filter((order) => !isReopened(order))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

import { knownWarnings } from '@tallyui/core';
import { replacedOrderIds } from './reopened';
import type { PosOrder } from './types';

/** The `error.code` the outbox puts on a pending reopened sale whose `order.update` it cannot build (ADR-090 W4b). The row stays pending: unsent. */
export const UPDATE_UNSENDABLE = 'update_unsendable';
export const UPDATE_UNSENDABLE_MESSAGE = "The store can't accept this change yet. Ask the owner to update the POS plugin, then press Retry.";

/**
 * The orders a cashier must look at: rejected, applied with a known warning, taken after their
 * session closed (`lateSessionId`) or with local warnings (whatever the sync status), or pending with a `commandId` in
 * `stuckCommandIds` (the outbox's `OutboxState.stuck`: the store keeps failing it), newest first.
 * A warning code this till version doesn't know is not shown here (`knownWarnings`). Never changes `orders`.
 * `register_session_unknown` is not shown, because the store counts the order once its session arrives (ADR-078).
 * A refused order is left out once its finalized successor is in `orders`.
 * Pending updates marked `UPDATE_UNSENDABLE` are shown until a person acts.
 * An order a cashier marked handled (`markAttentionHandled`) is left out while its `commandId` is the one it was marked
 * for; a requeue mints a new `commandId`, so a fresh refusal shows again (ADR-092 6f).
 */
export function needsAttention(orders: PosOrder[], options: { stuckCommandIds?: readonly string[] } = {}): PosOrder[] {
  const replaced = replacedOrderIds(orders);
  return orders.filter((order) => order.syncStatus === 'rejected'
    || (order.syncStatus === 'pending' && order.error?.code === UPDATE_UNSENDABLE)
    || (order.localWarnings?.length ?? 0) > 0
    || (order.syncStatus === 'applied' && knownWarnings(order.warnings).some((warning) => warning.code !== 'register_session_unknown')) || order.lateSessionId !== undefined
    || (order.syncStatus === 'pending' && options.stuckCommandIds?.includes(order.commandId) === true))
    .filter((order) => !replaced.has(order.id) && !(order.attentionHandledFor !== undefined && order.attentionHandledFor === order.commandId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

import { knownWarnings } from '@tallyui/core';
import { replacedOrderIds } from './reopened';
import { storeOrderLeft } from './store-order-left';
import { settledOnStore } from './store-settlement';
import type { PosOrder } from './types';

/** The `error.code` the outbox puts on a pending reopened sale whose `order.update` it cannot build (ADR-090 W4b). The row stays pending: unsent. */
export const UPDATE_UNSENDABLE = 'update_unsendable';
export const UPDATE_UNSENDABLE_MESSAGE = "The store can't accept this change yet. Ask the owner to update the POS plugin, then press Retry.";

/** ADR-048's T = ⌈(lines + surcharges) / 2⌉, applied once to the whole order: stored lines, fees and shipping rows. */
function roundingBridgeTolerance(order: PosOrder): number {
  return Math.ceil((order.lines.length + (order.fees?.length ?? 0) + (order.shipping?.length ?? 0)) / 2);
}

/**
 * The orders a cashier must look at: rejected, applied with a known warning, taken after their
 * session closed (`lateSessionId`) or with local warnings (whatever the sync status), or pending with a `commandId` in
 * `stuckCommandIds` (the outbox's `OutboxState.stuck`: the store keeps failing it), newest first.
 * A warning code this till version doesn't know is not shown here (`knownWarnings`). Never changes `orders`.
 * `register_session_unknown` is not shown, because the store counts the order once its session arrives (ADR-078).
 * A `total_mismatch` whose rounding bridge is within ADR-048's tolerance (|`bridgeMinor`| ≤ ⌈(lines + fees + shipping) / 2⌉)
 * is not shown for itself: the row's notice says it.
 * A refused order is left out once its finalized successor is in `orders`.
 * Pending updates marked `UPDATE_UNSENDABLE` are shown until a person acts.
 * An order a cashier marked handled (`markAttentionHandled`) is left out while its `commandId` is the one it was marked
 * for; a requeue mints a new `commandId`, so a fresh refusal shows again (ADR-092 6f). The mark does not hide a refused
 * sale whose order the store created (`storeOrderLeft`, #1101). A refused sale whose store order is settled on the store
 * (`settledOnStore`: cancelled or gone, #1101) is not shown for its refusal; any other reason above still shows it.
 */
export function needsAttention(orders: PosOrder[], options: { stuckCommandIds?: readonly string[] } = {}): PosOrder[] {
  const replaced = replacedOrderIds(orders);
  return orders.filter((order) => {
    const tolerance = roundingBridgeTolerance(order);
    return (order.syncStatus === 'rejected' && !settledOnStore(order))
      || (order.syncStatus === 'pending' && order.error?.code === UPDATE_UNSENDABLE)
      || (order.localWarnings?.length ?? 0) > 0
      || (order.syncStatus === 'applied' && knownWarnings(order.warnings).some((warning) => warning.code !== 'register_session_unknown'
        && !(warning.code === 'total_mismatch' && warning.bridgeMinor !== undefined && Math.abs(warning.bridgeMinor) <= tolerance)))
      || order.lateSessionId !== undefined
      || (order.syncStatus === 'pending' && options.stuckCommandIds?.includes(order.commandId) === true);
  })
    .filter((order) => !replaced.has(order.id) && !(order.attentionHandledFor !== undefined && order.attentionHandledFor === order.commandId
      && storeOrderLeft(order) === undefined))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

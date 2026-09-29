import { knownWarnings } from '@tallyui/core';
import type { PosOrder } from './types';

/**
 * The orders a cashier must look at: rejected, applied with a known warning, or taken after
 * their session closed (`lateSessionId`, whatever the sync status), newest first. A warning code
 * this till version doesn't know is not shown here (`knownWarnings`). Never changes `orders`.
 */
export function needsAttention(orders: PosOrder[]): PosOrder[] {
  return orders.filter((order) => order.syncStatus === 'rejected'
    || (order.syncStatus === 'applied' && knownWarnings(order.warnings).length > 0) || order.lateSessionId !== undefined)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

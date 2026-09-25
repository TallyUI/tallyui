import type { PosOrder } from './types';

/**
 * The orders a cashier must look at: rejected, applied with warnings, or taken after their session
 * closed (`lateSessionId`, whatever the sync status), newest first. Never changes `orders`.
 */
export function needsAttention(orders: PosOrder[]): PosOrder[] {
  return orders.filter((order) => order.syncStatus === 'rejected'
    || (order.syncStatus === 'applied' && !!order.warnings?.length) || order.lateSessionId !== undefined)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

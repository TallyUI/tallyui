import type { PosOrder } from './types';

/** The orders a cashier must look at: rejected, or applied with warnings, newest first. Never changes `orders`. */
export function needsAttention(orders: PosOrder[]): PosOrder[] {
  return orders.filter((order) => order.syncStatus === 'rejected'
    || (order.syncStatus === 'applied' && !!order.warnings?.length))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

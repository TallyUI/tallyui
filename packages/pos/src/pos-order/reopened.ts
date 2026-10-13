import type { PosOrder } from './types';

/** Only tells that a reopen was started: a UI hint with no accounting meaning. */
export function isReopened(order: Pick<PosOrder, 'syncStatus' | 'reopenedAt'>): boolean {
  return order.syncStatus === 'rejected' && order.reopenedAt !== undefined;
}

/** Payments count on the successor, so the refused order counts nowhere (ADR-077 R5 amended). Only this list is considered. */
export function replacedOrderIds(orders: readonly Pick<PosOrder, 'id' | 'saleId' | 'syncStatus'>[]): Set<string> {
  const predecessors = new Set(orders.filter((order) => order.saleId !== order.id).map((order) => order.saleId));
  return new Set(orders.filter((order) => order.syncStatus === 'rejected' && predecessors.has(order.id)).map((order) => order.id));
}

import type { PosOrder } from './types';

/** A refused order the till reopened as a parked sale (ADR-077 d4b). Its payments count on the new sale, so it counts nowhere (R5). */
export function isReopened(order: Pick<PosOrder, 'syncStatus' | 'reopenedAt'>): boolean {
  return order.syncStatus === 'rejected' && order.reopenedAt !== undefined;
}

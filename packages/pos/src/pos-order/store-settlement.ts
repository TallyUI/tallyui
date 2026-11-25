import { storeOrderLeft } from './store-order-left';
import type { PosOrder } from './types';

/** Whether the store order a refused sale left behind is settled on the store (#1101): its settlement is done or gone. */
export function settledOnStore(order: Pick<PosOrder, 'storeSettlement'>): boolean {
  const state = order.storeSettlement?.state;
  return state === 'done' || state === 'gone';
}

/**
 * Whether the till may cancel the store order a refused sale left behind (#1101): there is one (`storeOrderLeft`), the
 * store had recorded nothing paid on it, it is not settled (`settledOnStore`), and there is no settlement yet, or a
 * cancel (whose `sending` attempt a repeat finishes), or one the store changed or refused.
 */
export function canCancelOnStore(order: Pick<PosOrder, 'syncStatus' | 'storeOrderId' | 'error' | 'payments' | 'storeSettlement'>): boolean {
  const left = storeOrderLeft(order);
  if (!left || left.recordedMinor !== 0 || settledOnStore(order)) return false;
  const settlement = order.storeSettlement;
  return settlement === undefined || settlement.kind === 'cancel' || settlement.state === 'changed' || settlement.state === 'refused';
}

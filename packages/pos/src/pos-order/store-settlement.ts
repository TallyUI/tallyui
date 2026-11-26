import { storeOrderLeft } from './store-order-left';
import type { PosOrder } from './types';

type LeftOrder = Pick<PosOrder, 'syncStatus' | 'storeOrderId' | 'error' | 'payments' | 'storeSettlement'>;
export const TILL_SESSION_CLOSED = 'till_session_closed';

/**
 * Whether the store order a refused sale left behind is settled on the store (#1101): its settlement is done, or gone
 * while the store had recorded nothing on it (desk ruling: a gone order with money recorded still needs a manager).
 */
export function settledOnStore(order: LeftOrder | Pick<PosOrder, 'storeSettlement'>): boolean {
  const state = order.storeSettlement?.state;
  if (state === 'done') return true;
  if (state !== 'gone') return false;
  const left = 'syncStatus' in order ? storeOrderLeft(order) : undefined;
  return !left || left.recordedMinor === 0;
}

/**
 * Whether the till may cancel the store order a refused sale left behind (#1101): there is one (`storeOrderLeft`), the
 * store had recorded nothing paid on it, it is not settled (`settledOnStore`), and there is no settlement yet, or a
 * cancel (whose `sending` attempt a repeat finishes), or one the store changed or refused.
 */
export function canCancelOnStore(order: LeftOrder): boolean {
  if (order.storeSettlement?.code === TILL_SESSION_CLOSED) return false;
  const left = storeOrderLeft(order);
  if (!left || left.recordedMinor !== 0 || settledOnStore(order)) return false;
  const settlement = order.storeSettlement;
  return settlement === undefined || settlement.kind === 'cancel' || settlement.state === 'changed' || settlement.state === 'refused';
}

function recordedCount(order: Pick<PosOrder, 'error'>): number {
  const recorded = order.error?.data?.recorded;
  return Number.isSafeInteger(recorded) && (recorded as number) > 0 ? recorded as number : 0;
}

/** The till's legs the store had recorded at the refusal, in recording order. */
export function recordedLegs(order: Pick<PosOrder, 'error' | 'payments'>): PosOrder['payments'] {
  return order.payments.slice(0, recordedCount(order));
}

/** The till's legs the store had not recorded at the refusal (#1101 slice 3): the payments after `data.recorded`, counted
 * as `storeOrderLeft` counts them. */
export function unrecordedLegs(order: Pick<PosOrder, 'error' | 'payments'>): PosOrder['payments'] {
  return order.payments.slice(recordedCount(order));
}

/** Whether the till can take its recorded legs off the store order and cancel it (#1101 slice 4). */
export function canReverseOnStore(order: LeftOrder): boolean {
  if (order.storeSettlement?.code === TILL_SESSION_CLOSED) return false;
  const left = storeOrderLeft(order), stored = order.storeSettlement;
  if (!left || left.recordedMinor <= 0 || settledOnStore(order)) return false;
  const legs = recordedLegs(order);
  if (!legs.length || !legs.every((leg) => leg.amountMinor > 0)) return false;
  return !stored || (stored.kind === 'reverse' && ['sending', 'changed', 'refused'].includes(stored.state))
    || (stored.kind === 'pay' && ['changed', 'refused'].includes(stored.state) && !stored.payments?.some((payment) => payment.done));
}

/**
 * Whether the till may record its unrecorded legs on the part-paid store order a refused sale left behind (#1101 slice
 * 3): the store had recorded some of the sale, it is not settled, every leg left has an amount, the settlement is not
 * `gone` (the order is not on the store, so a press could only read 404 again), and there is no settlement yet, or a
 * pay (whose `sending` attempt a repeat finishes), or one the store changed or refused without a reverse leg taken off.
 */
export function canPayRestOnStore(order: LeftOrder): boolean {
  if (order.storeSettlement?.code === TILL_SESSION_CLOSED) return false;
  const left = storeOrderLeft(order);
  if (!left || left.recordedMinor <= 0 || settledOnStore(order)) return false;
  const legs = unrecordedLegs(order);
  if (legs.length === 0 || !legs.every((leg) => leg.amountMinor > 0)) return false;
  const settlement = order.storeSettlement;
  if (settlement?.state === 'gone') return false;
  if (settlement?.kind === 'reverse' && settlement.legs?.some((leg) => leg.done)) return false;
  return settlement === undefined || settlement.kind === 'pay' || settlement.state === 'changed' || settlement.state === 'refused';
}

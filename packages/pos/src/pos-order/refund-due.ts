import type { Payment } from '../order/types';
import { countsTowardPaid } from '../tender/payment-legs';
import type { PosOrder } from './types';

const sum = (amounts: number[]) => amounts.reduce((total, amount) => total + amount, 0);

/**
 * What the store owes back on a stored sale (ADR-090, desk Q4 2026-11-17): the stored `refundDueMinor`, which
 * `finalizeOrder` writes on every reopened sale (0 when nothing is due); a till sale and a row stored before v15 have
 * none, and for those `sum(payments) − total`, never below 0, gives 0 because a till sale's cash leg is capped at the balance.
 */
export function refundDueOf(order: Pick<PosOrder, 'refundDueMinor' | 'payments' | 'totalMinor'>): number {
  return order.refundDueMinor ?? Math.max(0, sum(order.payments.map((payment) => payment.amountMinor)) - order.totalMinor);
}

/**
 * The same figure for a sale still in the builder: the locked legs (the store's own, ADR-090) beyond the new total.
 * Unlocked legs never count, so a cashier's cash overpayment stays change.
 */
export function lockedRefundDueMinor(order: { payments: readonly Pick<Payment, 'locked' | 'amountMinor'>[]; totalMinor: number }): number {
  return Math.max(0, sum(order.payments.filter((payment) => payment.locked).map((payment) => payment.amountMinor)) - order.totalMinor);
}

/**
 * The till legs a reopened sale may not keep (ADR-090 gate 36c): once the store's locked legs cover the total, every
 * unlocked payment is refused. Mirrors finalizeOrder's desk Q6 check (finalize.ts:193-197), so the pane can name and
 * remove them before Complete instead of after it throws. It judges only captured legs, the ones useSale's complete
 * passes to finalizeOrder (use-sale.ts:713), so a voided or failed till leg is never named.
 */
export function tillLegsTheStoreRefuses(order: { storeOrder?: unknown; totalMinor: number; payments: readonly Pick<Payment, 'id' | 'locked' | 'amountMinor' | 'status'>[] }): string[] {
  if (order.storeOrder === undefined) return [];
  const captured = order.payments.filter(countsTowardPaid);
  const lockedMinor = sum(captured.filter((payment) => payment.locked).map((payment) => payment.amountMinor));
  return lockedMinor >= order.totalMinor ? captured.filter((payment) => !payment.locked).map((payment) => payment.id) : [];
}

/** The cash this sale took that goes back if it is cancelled (ADR-072 d3, amended 2026-11-22; v2's cancel-payment view, return_cash):
 * each captured, taken cash leg the till holds (not locked, not reopened, not counted by an after-close closure), and their sum,
 * net of the change the till already gave (changeDueMinor beyond the store's refund due), taken off the last cash legs first. */
export function cashToReturn(order: { totalMinor: number; changeDueMinor: number; afterClose?: { payments: readonly { id: string }[] }; payments: readonly Pick<Payment, 'id' | 'method' | 'amountMinor' | 'status' | 'takenAt' | 'locked' | 'reopened'>[] }): { legs: { id: string; amountMinor: number }[]; totalMinor: number } {
  const listed = order.payments.filter((leg) => leg.method === 'cash' && countsTowardPaid(leg) && leg.takenAt !== undefined && !leg.locked && !leg.reopened
    && !order.afterClose?.payments.some((counted) => counted.id === leg.id)).map((leg) => ({ id: leg.id, amountMinor: leg.amountMinor }));
  let change = order.changeDueMinor - Math.min(order.changeDueMinor, lockedRefundDueMinor(order));
  for (const leg of [...listed].reverse()) {
    const taken = Math.min(change, leg.amountMinor);
    leg.amountMinor -= taken;
    change -= taken;
  }
  const legs = listed.filter((leg) => leg.amountMinor > 0);
  return { legs, totalMinor: sum(legs.map((leg) => leg.amountMinor)) };
}

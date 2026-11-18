import type { Payment } from '../order/types';
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
 * remove them before Complete instead of after it throws. It names voided and failed legs too, which useSale's complete
 * drops before finalizing, so a cashier removes those as well.
 */
export function tillLegsTheStoreRefuses(order: { storeOrder?: unknown; totalMinor: number; payments: readonly Pick<Payment, 'id' | 'locked' | 'amountMinor'>[] }): string[] {
  if (order.storeOrder === undefined) return [];
  const lockedMinor = sum(order.payments.filter((payment) => payment.locked).map((payment) => payment.amountMinor));
  return lockedMinor >= order.totalMinor ? order.payments.filter((payment) => !payment.locked).map((payment) => payment.id) : [];
}

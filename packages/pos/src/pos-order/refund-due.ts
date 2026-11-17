import type { Payment } from '../order/types';
import type { PosOrder } from './types';

const sum = (amounts: number[]) => amounts.reduce((total, amount) => total + amount, 0);

/**
 * What the store owes back on a stored sale (ADR-090, desk Q4 2026-11-17): the stored `refundDueMinor`, written at
 * finalize; for a row without it, `sum(payments) − total`, never below 0. A till sale's cash leg is capped at the
 * balance (`finalizeOrder`), so an ordinary sale gives 0.
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

/**
 * Port of v2's cash rounding: packages/order-math/src/payments/rounding.ts and
 * packages/core/src/screens/main/pos/checkout/tender/tender-figures.ts.
 * v2's tender LEDGER: "a partial or short cash entry and every other method keep full precision".
 * The till records the rounding as an order field, Order.cashRoundings (ADR-094).
 */
import { wireMethodOf, type PaymentMethodDescriptor, type PaymentRounding } from '@tallyui/core';
import { appliedMinor, type TenderState } from './tender-state';
import { countsTowardPaid, type PaymentLegStatus } from './payment-legs';

/** How the method rounds to its increment. */
export type RoundingMode = NonNullable<PaymentRounding>['mode'];

/** v2 roundToIncrement; also the identity for an increment that is not an integer. */
export function roundToIncrement(minor: number, incrementMinor: number, mode: RoundingMode): number {
  if (!Number.isInteger(incrementMinor) || incrementMinor <= 1) return minor;
  const remainder = minor % incrementMinor;
  if (remainder === 0) return minor;
  const down = minor - remainder;
  if (mode === 'down') return down;
  if (mode === 'up') return down + incrementMinor;
  return remainder * 2 >= incrementMinor ? down + incrementMinor : down;
}

/** ADR-094: the sale rounds once, against its unrounded remainder. */
export function roundedRemainder(balanceMinor: number, entriesMinor: number, rounding: NonNullable<PaymentRounding>): number {
  if (balanceMinor <= 0) return balanceMinor;
  const unrounded = balanceMinor - entriesMinor;
  return unrounded <= 0 ? 0 : roundToIncrement(unrounded, rounding.incrementMinor, rounding.mode);
}

/** Why a void is refused by ADR-094 item 6 (desk ruling (i), #1292): a later live leg's entry was computed against this leg's. */
export type CashVoidRefusal = 'later_cash_rounding';
/**
 * ADR-094 item 6: a leg carrying a live rounding entry cannot be voided while a later leg that counts toward paid carries one;
 * the later one is voided first. The latest entry-carrying leg is never refused, so a sale cannot be stranded by this rule.
 */
export function cashVoidRefusal(order: { payments: readonly { id: string; status?: PaymentLegStatus }[]; cashRoundings?: readonly { paymentId: string; minor: number }[] }, paymentId: string): CashVoidRefusal | undefined {
  const carries = (id: string) => (order.cashRoundings ?? []).some((entry) => entry.paymentId === id && entry.minor !== 0);
  const at = order.payments.findIndex((leg) => leg.id === paymentId);
  if (at < 0 || !carries(paymentId)) return undefined;
  return order.payments.slice(at + 1).some((leg) => countsTowardPaid(leg) && carries(leg.id)) ? 'later_cash_rounding' : undefined;
}
/** The balance under a cash method's rounding, with its signed difference. */
export function roundedDue(
  balanceMinor: number,
  method: PaymentMethodDescriptor | null,
  /** The sum of the order's live cashRoundings, already counted in the balance. */
  entriesMinor = 0,
): { dueMinor: number; roundingMinor: number } {
  const rounding = method?.capture.mode === 'manual' && wireMethodOf(method) === 'cash' ? method.defaults.rounding : null;
  if (!rounding) return { dueMinor: balanceMinor, roundingMinor: 0 };
  const dueMinor = roundedRemainder(balanceMinor, entriesMinor, rounding);
  return { dueMinor, roundingMinor: dueMinor - balanceMinor };
}

/** Whether the leg reaches the rounded due and the tendered amount covers it. */
export function settlesAtRoundedDue(facts: {
  amountMinor: number;
  tenderedMinor: number;
  balanceMinor: number;
  dueMinor: number;
}): boolean {
  const { amountMinor, tenderedMinor, balanceMinor, dueMinor } = facts;
  return amountMinor >= Math.min(balanceMinor, dueMinor) && tenderedMinor >= dueMinor;
}

/** Local tender figures under the method's cash rounding. */
export interface TenderRounding {
  /** The balance under the method's rounding (the balance itself when none applies). */
  roundedDueMinor: number;
  /** `roundedDueMinor - balanceMinor` when the entry settles at the rounded due, else 0. Signed. */
  roundingMinor: number;
  /** The entry as the cashier sees it: an untouched prefill of the balance shows the rounded due. */
  entryMinor: number;
  /** What the entry applies to the order: the rounded due when rounding applies, else the capped entry. */
  appliedMinor: number;
}

/** Figure the displayed entry and applied amount, rounding only a leg that settles at the due. */
export function tenderRounding(
  state: Pick<TenderState, 'entryMinor' | 'entryDirty'>,
  balanceMinor: number,
  method: PaymentMethodDescriptor | null,
  /** The sum of the order's live cashRoundings, already counted in the balance. */
  entriesMinor = 0,
): TenderRounding {
  const roundedDueMinor = roundedDue(balanceMinor, method, entriesMinor).dueMinor;
  const entryMinor = !state.entryDirty && state.entryMinor === balanceMinor ? roundedDueMinor : state.entryMinor;
  const legMinor = appliedMinor(entryMinor, balanceMinor);
  const roundingMinor = settlesAtRoundedDue({
    amountMinor: legMinor,
    tenderedMinor: entryMinor,
    balanceMinor,
    dueMinor: roundedDueMinor,
  }) ? roundedDueMinor - balanceMinor : 0;
  return { roundedDueMinor, roundingMinor, entryMinor, appliedMinor: roundingMinor !== 0 ? roundedDueMinor : legMinor };
}

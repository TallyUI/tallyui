/**
 * Port of v2's cash rounding: packages/order-math/src/payments/rounding.ts and
 * packages/core/src/screens/main/pos/checkout/tender/tender-figures.ts.
 * v2's tender LEDGER: "a partial or short cash entry and every other method keep full precision".
 * Local figures only; writing the rounding as an order line is unit 24.
 */
import type { PaymentMethodDescriptor, PaymentRounding } from '@tallyui/core';
import { appliedMinor, type TenderState } from './tender-state';

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

/** The balance under a manual method's rounding, with its signed difference. */
export function roundedDue(
  balanceMinor: number,
  method: PaymentMethodDescriptor | null,
): { dueMinor: number; roundingMinor: number } {
  const rounding = method?.capture.mode === 'manual' ? method.defaults.rounding : null;
  if (!rounding) return { dueMinor: balanceMinor, roundingMinor: 0 };
  const dueMinor = roundToIncrement(balanceMinor, rounding.incrementMinor, rounding.mode);
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
): TenderRounding {
  const roundedDueMinor = roundedDue(balanceMinor, method).dueMinor;
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

import type { PaymentMethodDescriptor } from '@tallyui/core';
import { roundedDue, settlesAtRoundedDue } from './cash-rounding';
import { countsTowardPaid, type PaymentLegStatus } from './payment-legs';
import {
  activePlan,
  appliedMinor,
  changeMinor,
  percentOfMinor,
  planLegs,
  quickTenderedAmounts,
  type TenderState,
} from './tender-state';

/** The notes a cashier is handed: the balance itself, then the next whole 5, 10 and 50. */
const QUICK_TENDER_STEPS = [5, 10, 50] as const;

/** A gateway that takes no part payment runs the whole order. */
export const runsWholeOrder = (method: PaymentMethodDescriptor | null) =>
  method?.capture.mode === 'gateway' && !method.capabilities.amount.partial;

export interface TenderFacts {
  /** Currency decimal places; every `*Minor` number is in these units. */
  dp: number;
  balanceMinor: number;
  /** The order's payment legs in ledger order; only those that count toward paid are numbered. */
  payments: readonly { status?: PaymentLegStatus }[];
  /** The counted legs since `plan.from`, as `tender-recorded` and `planLegs` read them. */
  rowsSinceFrom: { minor: number; title: string }[];
  /** The selected method, or null in the select view. */
  method: PaymentMethodDescriptor | null;
  state: Pick<TenderState, 'view' | 'entryMinor' | 'entryDirty' | 'entryMode' | 'plan'>;
}
export type TenderFigures = ReturnType<typeof tenderFigures>;

/** Every number the keypad shows and commits, computed once and formatted by the pane. */
export function tenderFigures(facts: TenderFacts) {
  const { dp, balanceMinor, payments, rowsSinceFrom, method, state } = facts;
  const fixedAmount = runsWholeOrder(method);
  const plan = fixedAmount ? null : activePlan(state.plan, rowsSinceFrom.length, balanceMinor);
  const split = plan ? planLegs(plan, rowsSinceFrom, balanceMinor) : null;
  const legs = split?.legs ?? [];
  const done = legs.filter((leg) => leg.state === 'done');
  const counted = payments.filter(countsTowardPaid).length;
  const n = counted + 1;
  const ways = plan && split ? Math.min(plan.from, counted) + split.label.ways : 0;
  const groupDone =
    plan?.kind === 'items' && done.reduce((sum, leg) => sum + leg.minor, 0) >= plan.firstMinor;
  const thisPaymentMinor = split?.thisPaymentMinor ?? balanceMinor;
  const legCapMinor = method?.capabilities.change ? thisPaymentMinor : balanceMinor;
  const roundedDueMinor = roundedDue(balanceMinor, method).dueMinor;
  const percent = state.entryMode === 'percent';
  const percentMinor = percent ? percentOfMinor(balanceMinor, state.entryMinor) : null;
  const entryMinor =
    percentMinor ??
    (!state.entryDirty && state.entryMinor === balanceMinor ? roundedDueMinor : state.entryMinor);
  const enteredLegMinor = fixedAmount ? balanceMinor : appliedMinor(entryMinor, legCapMinor);
  const roundingMinor = settlesAtRoundedDue({
    amountMinor: enteredLegMinor,
    tenderedMinor: entryMinor,
    balanceMinor,
    dueMinor: roundedDueMinor,
  }) ? roundedDueMinor - balanceMinor : 0;
  const entryAppliedMinor = roundingMinor !== 0 ? roundedDueMinor : enteredLegMinor;
  const givesChange = method?.capabilities.change ?? false;
  const nowMinor = state.view === 'amount' ? entryAppliedMinor : thisPaymentMinor;
  const dueMinor = roundingMinor !== 0 ? roundedDueMinor : thisPaymentMinor;
  const typed = state.entryDirty && entryAppliedMinor > 0 && entryAppliedMinor < balanceMinor;
  return {
    fixedAmount,
    /** The plan as the keypad sees it: null once its legs are taken, or for a fixed gateway. */
    plan,
    legs,
    /** The plan's untranslated label pieces; the flow localizes them. */
    label: split?.label ?? null,
    /** "Payment n of ways", numbered across the bill; `ways` is 0 without a plan. */
    n,
    ways,
    /** Planned payments still to come after this one. */
    toCome: legs.filter((leg) => leg.state === 'todo').length,
    groupDone,
    /** An items plan shared more than one way, its group not yet paid. */
    shared: plan?.kind === 'items' && plan.ways > 1 && !groupDone,
    /** The planned leg, or the balance with no plan. */
    thisPaymentMinor,
    roundedDueMinor,
    /** `roundedDueMinor - balanceMinor` when the entry settles at the rounded due, else 0. */
    roundingMinor,
    percentMinor,
    /** The entry as the cashier sees it: percent share or the (rounded) prefill. */
    entryMinor,
    /** The leg the entry makes before rounding (the commit's `amountMinor`). */
    enteredLegMinor,
    /** That leg after cash rounding: what the entry applies to the order. */
    entryAppliedMinor,
    entryChangeMinor: changeMinor(entryMinor, entryAppliedMinor, givesChange),
    /** THIS payment: the applied entry on the keypad, the planned share in the select view. */
    nowMinor,
    afterThisPaymentMinor: balanceMinor + roundingMinor - nowMinor,
    quickAmountsMinor: givesChange
      ? quickTenderedAmounts(nowMinor, QUICK_TENDER_STEPS.map((step) => step * 10 ** dp))
      : [],
    dueMinor,
    /** The Exact chip: the rounded due whenever this leg is the whole balance, since tapping it settles. */
    exactMinor: thisPaymentMinor === balanceMinor ? roundedDueMinor : dueMinor,
    /** The big figure. */
    shownMinor:
      state.view === 'select' ? dueMinor : fixedAmount || percent ? entryAppliedMinor : entryMinor,
    /** A no-change method typed past the balance; a fixed-amount gateway applies the balance whatever is typed. */
    noChange: method !== null && !givesChange && !fixedAmount && !percent && entryMinor > balanceMinor,
    /** An amount typed below the balance is THIS payment; the split helpers divide the rest. */
    typed,
    restMinor: balanceMinor - (typed ? entryAppliedMinor : 0),
  };
}

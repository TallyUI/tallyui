import { describe, it, expect } from 'vitest';
import { paymentMethodOf } from '@tallyui/core';
import { tenderFigures, type TenderFacts, type TenderFigures } from './tender-figures';
import { initialTenderState } from './tender-state';

const cash = paymentMethodOf('cash');
const card = paymentMethodOf('external');
const roundedCash: TenderFacts['method'] = {
  ...cash,
  defaults: { ...cash.defaults, rounding: { incrementMinor: 5, mode: 'nearest' } },
};
const wholeOrderGateway: TenderFacts['method'] = {
  ...card,
  capture: { ...card.capture, mode: 'gateway' },
  capabilities: { ...card.capabilities, amount: { partial: false } },
};
const facts = (
  overrides: Partial<Omit<TenderFacts, 'state'>> = {},
  state: Partial<TenderFacts['state']> = {},
): TenderFacts => ({
  dp: 2, balanceMinor: 9295, payments: [], rowsSinceFrom: [], method: cash,
  ...overrides,
  state: { ...initialTenderState, view: 'amount', ...state },
});

describe('tenderFigures', () => {
  it.each<[string, TenderFacts, Partial<TenderFigures>]>([
    [
      'cash typed under the balance is a part payment',
      facts({}, { entryMinor: 2000, entryDirty: true }),
      {
        entryAppliedMinor: 2000, entryChangeMinor: 0, afterThisPaymentMinor: 7295, shownMinor: 2000,
        typed: true, restMinor: 7295, quickAmountsMinor: [2000, 5000],
      },
    ],
    [
      'cash tendered over the balance hands back change',
      facts({}, { entryMinor: 10000, entryDirty: true }),
      { entryAppliedMinor: 9295, entryChangeMinor: 705, afterThisPaymentMinor: 0, noChange: false },
    ],
    [
      'a method that gives no change refuses an over-tender',
      facts({ method: card }, { entryMinor: 10000, entryDirty: true }),
      { entryAppliedMinor: 9295, entryChangeMinor: 0, noChange: true, quickAmountsMinor: [] },
    ],
    [
      'an untouched prefill under cash rounding is the rounded due',
      facts({ balanceMinor: 1003, method: roundedCash }, { entryMinor: 1003 }),
      {
        roundedDueMinor: 1005, roundingMinor: 2, entryMinor: 1005, entryAppliedMinor: 1005,
        dueMinor: 1005, exactMinor: 1005, afterThisPaymentMinor: 0,
      },
    ],
    [
      'a gateway that runs the whole order applies the balance and drops the plan',
      facts({ method: wholeOrderGateway },
        { entryMinor: 100, entryDirty: true, plan: { kind: 'even', ways: 2, from: 0 } }),
      { fixedAmount: true, plan: null, legs: [], entryAppliedMinor: 9295, shownMinor: 9295 },
    ],
    [
      'a no-change method takes what was typed past the planned share, capped at the balance',
      facts({ balanceMinor: 2000, method: card },
        { entryMinor: 1500, entryDirty: true, plan: { kind: 'even', ways: 2, from: 0 } }),
      { thisPaymentMinor: 1000, entryAppliedMinor: 1500, exactMinor: 1000 },
    ],
    [
      'cash past the planned share is change, not a bigger leg',
      facts({ balanceMinor: 2000 },
        { entryMinor: 1500, entryDirty: true, plan: { kind: 'even', ways: 2, from: 0 } }),
      { thisPaymentMinor: 1000, entryAppliedMinor: 1000, entryChangeMinor: 500 },
    ],
    [
      'percent entry is a share of the balance',
      facts({ balanceMinor: 18250 }, { entryMode: 'percent', entryMinor: 25 }),
      { percentMinor: 4563, entryAppliedMinor: 4563, shownMinor: 4563, noChange: false },
    ],
    [
      'an even plan',
      facts({ balanceMinor: 900 }, { plan: { kind: 'even', ways: 3, from: 0 } }),
      { n: 1, ways: 3, toCome: 2, thisPaymentMinor: 300 },
    ],
    [
      'a fixed first payment then three ways, after two taken and a failed one',
      facts({ balanceMinor: 14450, payments: [{ status: 'failed' }, { status: 'captured' }, { status: 'captured' }] },
        { plan: { kind: 'fixed', firstMinor: 2000, title: null, thenWays: 3, from: 3 } }),
      { n: 3, ways: 6, toCome: 3, thisPaymentMinor: 2000 },
    ],
    [
      "the fixed plan's second leg",
      facts({ balanceMinor: 12450, payments: [{ status: 'captured' }, { status: 'captured' }, { status: 'captured' }],
        rowsSinceFrom: [{ minor: 2000, title: 'Cash' }] },
        { plan: { kind: 'fixed', firstMinor: 2000, title: null, thenWays: 3, from: 2 } }),
      { n: 4, ways: 6, toCome: 2, thisPaymentMinor: 4150 },
    ],
    [
      'an items group shared two ways',
      facts({ balanceMinor: 5000 },
        { plan: { kind: 'items', lineIds: ['l1'], firstMinor: 1000, ways: 2, from: 0 } }),
      { n: 1, ways: 2, shared: true, groupDone: false, thisPaymentMinor: 500 },
    ],
    [
      'an items group already paid',
      facts({ balanceMinor: 4000, payments: [{ status: 'captured' }], rowsSinceFrom: [{ minor: 1000, title: 'Cash' }] },
        { plan: { kind: 'items', lineIds: ['l1'], firstMinor: 1000, ways: 1, from: 0 } }),
      { n: 2, ways: 2, shared: false, groupDone: true },
    ],
    [
      'in the select view, this payment is the planned share and nothing is left after it',
      facts({ balanceMinor: 5000, payments: [{ status: 'captured' }], method: null }, { view: 'select', entryMinor: 0 }),
      { nowMinor: 5000, afterThisPaymentMinor: 0, shownMinor: 5000 },
    ],
    [
      'numbers only counted payments before the plan',
      facts({ balanceMinor: 2000, payments: [{ status: 'captured' }, { status: 'failed' }, { status: 'captured' }] },
        { plan: { kind: 'even', ways: 2, from: 2 } }),
      { n: 3, ways: 4, toCome: 1 },
    ],
    [
      'numbers a plan by its own legs when a leg before it was voided (#1133)',
      facts({ balanceMinor: 1000, payments: [{ status: 'voided' }, { status: 'captured' }], rowsSinceFrom: [{ minor: 500, title: 'cash' }] },
        { plan: { kind: 'even', ways: 3, from: 1, before: ['a'] } }),
      { n: 2, ways: 3 },
    ],
    [
      'figures a fixed first payment followed by three equal shares in the select view',
      facts({ balanceMinor: 18250 },
        { view: 'select', plan: { kind: 'fixed', firstMinor: 2000, thenWays: 3, title: null, from: 0 } }),
      { thisPaymentMinor: 2000, toCome: 3,
        legs: [
          { minor: 2000, state: 'now' }, { minor: 5417, state: 'todo' },
          { minor: 5417, state: 'todo' }, { minor: 5416, state: 'todo' },
        ],
      },
    ],
  ])('%s', (_name, input, expected) => {
    expect(tenderFigures(input)).toMatchObject(expected);
  });
});

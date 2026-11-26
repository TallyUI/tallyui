import { describe, expect, it } from 'vitest';
import { countedTillPayments, settledAwayOnStore } from '../pos-order/till-payments';
import type { PosOrderStoreSettlement } from '../pos-order/types';
import { deriveExpected, paymentLedgerRows, takingsByMethod } from './expected';

const cash = { id: 'cash', method: 'cash', amountMinor: 1000 };
const second = { id: 'second', method: 'cash', amountMinor: 500 };
const card = { id: 'card', method: 'external', amountMinor: 500 };
const session = { id: 'session', countedFloatMinor: 10000 };
const leg = (payment: typeof cash, done: boolean) => ({ paymentId: payment.id, commandId: `cmd-${payment.id}`, done });
const settlement = (kind: PosOrderStoreSettlement['kind'], state: PosOrderStoreSettlement['state'], ...legs: ReturnType<typeof leg>[]) => ({ kind, state, legs });
const partial = settlement('reverse', 'refused', leg(cash, true), leg(second, false));
const expected = (payments: typeof cash[], storeSettlement?: ReturnType<typeof settlement>) => deriveExpected({
  session, movements: [], refunds: [], ledgerRowsBySession: paymentLedgerRows([{ payments, storeSettlement, sessionId: session.id }]),
});

describe('settled till payments (#1380)', () => {
  it.each([
    [undefined, false], [settlement('cancel', 'done'), true], [settlement('reverse', 'done'), true],
    [settlement('pay', 'done'), false], [settlement('reverse', 'sending'), false], [partial, false],
    [settlement('reverse', 'changed'), false], [settlement('reverse', 'gone'), false],
    [settlement('cancel', 'sending'), false], [settlement('cancel', 'refused'), false],
  ] as const)('H1: settledAwayOnStore(%o) is %s', (storeSettlement, away) => {
    expect(settledAwayOnStore({ storeSettlement })).toBe(away);
  });
  it.each([
    ['E1: cash give back done', [cash], settlement('reverse', 'done', leg(cash, true)), 10000],
    ['E2: cancel done', [cash], settlement('cancel', 'done'), 10000],
    ['E3: only the first cash leg voided', [cash, second], partial, 10500],
    ['E4: sending with no confirmed void', [cash], settlement('reverse', 'sending', leg(cash, false)), 11000],
    ['E7: pay done still counts', [cash], settlement('pay', 'done'), 11000],
    ['E8: reverse done with unrecorded cash', [cash, { ...second, amountMinor: 300 }], settlement('reverse', 'done', leg(cash, true)), 10000],
  ] satisfies [string, typeof cash[], ReturnType<typeof settlement>, number][])('%s', (_name, payments, storeSettlement, held) => {
    expect(expected(payments, storeSettlement)).toEqual({ cash: held });
  });
  it('E5: reversing card and cash leaves just the float', () => {
    expect(expected([card, cash], settlement('reverse', 'done', leg(card, true), leg(cash, true)))).toEqual({ cash: 10000 });
  });
  it('E6: a confirmed card void does not change cash', () => {
    expect(expected([card])).toEqual({ cash: 10000, external: 500 });
    expect(expected([card], settlement('reverse', 'changed', leg(card, true)))).toEqual({ cash: 10000 });
  });
  it('E9: drawer terms count only the remaining cash leg', () => {
    expect(takingsByMethod([{ payments: [cash, second], storeSettlement: partial, sessionId: session.id }], session.id))
      .toEqual({ cash: { amountMinor: 500, count: 1 } });
  });
});

describe('countedTillPayments', () => {
  it.each([
    [settlement('cancel', 'done'), []],
    [settlement('reverse', 'done', leg(cash, true)), []],
    [settlement('reverse', 'sending', leg(cash, false)), [cash, second]],
    [partial, [second]],
    [settlement('pay', 'done'), [cash, second]],
  ] satisfies [ReturnType<typeof settlement>, typeof cash[]][])('%o', (storeSettlement, counted) => {
    expect(countedTillPayments({ payments: [cash, second], storeSettlement })).toEqual(counted);
  });
  it('leaves out a locked store payment', () => {
    expect(countedTillPayments({ payments: [cash, { ...second, storePaymentId: 'store' }], storeSettlement: settlement('reverse', 'sending') })).toEqual([cash]);
  });
});

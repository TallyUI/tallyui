import { describe, expect, it } from 'vitest';
import type { PosOrder } from '../pos-order/types';
import { deriveDrawerTerms, deriveExpected, paymentLedgerRows, takingsByMethod, type Movement } from './expected';

type Row = Pick<PosOrder, 'sessionId' | 'payments'>;
const withoutIds = (orders: Row[]): Row[] =>
  orders.map((order) => ({ ...order, payments: order.payments.map(({ methodId: _id, ...payment }) => payment) }));
const drawer = (orders: Row[], movements: Movement[] = []) =>
  deriveDrawerTerms({ session: { id: 's1', countedFloatMinor: 0 }, movements, ledgerRowsBySession: paymentLedgerRows(orders) });
const sum = (takings: Record<string, { amountMinor: number }>) => Object.values(takings).reduce((total, term) => total + term.amountMinor, 0);

// A cash sale, a card sale, a split, a reopened sale whose locked leg the store already held, and a sale in another session.
const today: Row[] = [
  { sessionId: 's1', payments: [{ id: 'a', method: 'cash', amountMinor: 1200, tenderedMinor: 2000, changeMinor: 800 }] },
  { sessionId: 's1', payments: [{ id: 'b', method: 'external', amountMinor: 3000, reference: 'T-1' }] },
  { sessionId: 's1', payments: [{ id: 'c', method: 'external', amountMinor: 500 }, { id: 'd', method: 'cash', amountMinor: 700 }] },
  { sessionId: 's1', payments: [{ id: 'e', method: 'external', amountMinor: 4000, storePaymentId: '901' }, { id: 'f', method: 'cash', amountMinor: 250 }] },
  { sessionId: 's2', payments: [{ id: 'g', method: 'cash', amountMinor: 9999 }] },
];

describe('takingsByMethod (condition 4)', () => {
  it('groups legs with no methodId exactly as deriveDrawerTerms does', () => {
    const { cashSales, otherTenders } = drawer(today);
    expect(takingsByMethod(today, 's1')).toStrictEqual({ ...(cashSales.count ? { cash: cashSales } : {}), ...otherTenders });
    expect(takingsByMethod(today, 's1')).toStrictEqual({ cash: { amountMinor: 2150, count: 3 }, external: { amountMinor: 3500, count: 2 } });
    expect(takingsByMethod(today, 's3')).toStrictEqual({});
  });

  it('groups legs with ids under their ids; a session mixing old and new legs keeps its totals, its cash expected and its drawer', () => {
    const mixed: Row[] = [...today,
      { sessionId: 's1', payments: [{ id: 'h', method: 'cash', methodId: 'cod', amountMinor: 600, tenderedMinor: 1000, changeMinor: 400 }] },
      { sessionId: 's1', payments: [{ id: 'i', method: 'external', methodId: 'stripe', amountMinor: 1800, reference: 'pi_1' },
        { id: 'j', method: 'cash', methodId: 'cod', amountMinor: 200 }] },
    ];
    expect(takingsByMethod(mixed, 's1')).toStrictEqual({
      cash: { amountMinor: 2150, count: 3 }, external: { amountMinor: 3500, count: 2 },
      cod: { amountMinor: 800, count: 2 }, stripe: { amountMinor: 1800, count: 1 },
    });
    expect(sum(takingsByMethod(mixed, 's1'))).toBe(sum(takingsByMethod(withoutIds(mixed), 's1')));
    const movements: Movement[] = [{ id: 'm1', session_id: 's1', type: 'paid_in', amountMinor: 300 }];
    expect(drawer(mixed, movements)).toStrictEqual(drawer(withoutIds(mixed), movements));
    expect(deriveExpected({ session: { id: 's1', countedFloatMinor: 5000 }, movements, ledgerRowsBySession: paymentLedgerRows(mixed) }))
      .toStrictEqual(deriveExpected({ session: { id: 's1', countedFloatMinor: 5000 }, movements, ledgerRowsBySession: paymentLedgerRows(withoutIds(mixed)) }));
    const { cashSales, otherTenders } = drawer(mixed);
    expect(sum(takingsByMethod(mixed, 's1'))).toBe(cashSales.amountMinor + sum(otherTenders));
  });

  it('keeps register rows keyed by the wire method: a methodId never reaches method_id (#256)', () => {
    expect(paymentLedgerRows([{ sessionId: 's1', payments: [{ id: 'x', method: 'external', methodId: 'stripe', amountMinor: 100 }] }]))
      .toStrictEqual([{ session_id: 's1', kind: 'other', method_id: 'external', status: 'captured', amountMinor: 100 }]);
    expect(paymentLedgerRows([{ sessionId: 's1', payments: [{ id: 'y', method: 'cash', methodId: 'cod', amountMinor: 100 }] }]))
      .toStrictEqual([{ session_id: 's1', kind: 'cash', method_id: 'cash', status: 'captured', amountMinor: 100 }]);
  });
});

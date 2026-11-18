import { describe, expect, it } from 'vitest';
import type { PosOrder } from '../pos-order/types';
import { deriveDrawerTerms, deriveExpected, paymentLedgerRows, takingsByMethod, type Movement } from './expected';

type Row = Pick<PosOrder, 'sessionId' | 'payments'>;
const withoutIds = (orders: Row[]): Row[] =>
  orders.map((order) => ({ ...order, payments: order.payments.map(({ methodId: _id, ...payment }) => payment) }));
const drawer = (orders: Row[], movements: Movement[] = []) =>
  deriveDrawerTerms({ session: { id: 's1', countedFloatMinor: 0 }, movements, ledgerRowsBySession: paymentLedgerRows(orders) });
const sum = (takings: Record<string, { amountMinor: number }>) => Object.values(takings).reduce((total, term) => total + term.amountMinor, 0);
/** takingsByMethod's map has no prototype; a plain copy compares with toStrictEqual against object literals. */
const takings = (orders: Row[], sessionId: string) => ({ ...takingsByMethod(orders, sessionId) });

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
    expect(takings(today, 's1')).toStrictEqual({ ...(cashSales.count ? { cash: cashSales } : {}), ...otherTenders });
    expect(takings(today, 's1')).toStrictEqual({ cash: { amountMinor: 2150, count: 3 }, external: { amountMinor: 3500, count: 2 } });
    expect(takings(today, 's3')).toStrictEqual({});
  });

  it('groups legs with ids under their kind and id; a session mixing old and new legs keeps its totals, its cash expected and its drawer', () => {
    const mixed: Row[] = [...today,
      { sessionId: 's1', payments: [{ id: 'h', method: 'cash', methodId: 'cod', amountMinor: 600, tenderedMinor: 1000, changeMinor: 400 }] },
      { sessionId: 's1', payments: [{ id: 'i', method: 'external', methodId: 'stripe', amountMinor: 1800, reference: 'pi_1' },
        { id: 'j', method: 'cash', methodId: 'cod', amountMinor: 200 }] },
    ];
    expect(takings(mixed, 's1')).toStrictEqual({
      cash: { amountMinor: 2150, count: 3 }, external: { amountMinor: 3500, count: 2 },
      'cash:cod': { amountMinor: 800, count: 2 }, 'external:stripe': { amountMinor: 1800, count: 1 },
    });
    expect(sum(takingsByMethod(mixed, 's1'))).toBe(sum(takingsByMethod(withoutIds(mixed), 's1')));
    const movements: Movement[] = [{ id: 'm1', session_id: 's1', type: 'paid_in', amountMinor: 300 }];
    expect(drawer(mixed, movements)).toStrictEqual(drawer(withoutIds(mixed), movements));
    expect(deriveExpected({ session: { id: 's1', countedFloatMinor: 5000 }, movements, ledgerRowsBySession: paymentLedgerRows(mixed) }))
      .toStrictEqual(deriveExpected({ session: { id: 's1', countedFloatMinor: 5000 }, movements, ledgerRowsBySession: paymentLedgerRows(withoutIds(mixed)) }));
    const { cashSales, otherTenders } = drawer(mixed);
    expect(sum(takingsByMethod(mixed, 's1'))).toBe(cashSales.amountMinor + sum(otherTenders));
  });

  it('keys a platform id named like an Object.prototype member as any other id', () => {
    const before = Object.getOwnPropertyNames(Object.prototype).sort();
    const odd: Row[] = [{ sessionId: 's1', payments: [
      { id: 'p1', method: 'external', methodId: '__proto__', amountMinor: 100 }, { id: 'p2', method: 'external', methodId: 'constructor', amountMinor: 200 },
      { id: 'p3', method: 'external', methodId: 'toString', amountMinor: 300 }, { id: 'p4', method: 'external', methodId: '__proto__', amountMinor: 50 }] }];
    const result = takingsByMethod(odd, 's1');
    expect(Object.keys(result).sort()).toStrictEqual(['external:__proto__', 'external:constructor', 'external:toString']);
    expect(result['external:__proto__']).toStrictEqual({ amountMinor: 150, count: 2 });
    expect(result['external:constructor']).toStrictEqual({ amountMinor: 200, count: 1 });
    expect(result['external:toString']).toStrictEqual({ amountMinor: 300, count: 1 });
    // A lookup by a key the session never took finds nothing, never an inherited member.
    for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) expect(result[key]).toBeUndefined();
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toStrictEqual(before);
    expect(({} as Record<string, unknown>).amountMinor).toBeUndefined();
  });

  it("keeps an external leg whose id is 'cash' apart from cash, with the same sum", () => {
    const both: Row[] = [{ sessionId: 's1', payments: [{ id: 'q1', method: 'external', methodId: 'cash', amountMinor: 400 }, { id: 'q2', method: 'cash', amountMinor: 700 }] }];
    expect(takings(both, 's1')).toStrictEqual({ 'external:cash': { amountMinor: 400, count: 1 }, cash: { amountMinor: 700, count: 1 } });
    expect(sum(takingsByMethod(both, 's1'))).toBe(sum(takingsByMethod(withoutIds(both), 's1')));
    expect(sum(takingsByMethod(both, 's1'))).toBe(1100);
  });

  it('keeps register rows keyed by the wire method: a methodId never reaches method_id (#256)', () => {
    expect(paymentLedgerRows([{ sessionId: 's1', payments: [{ id: 'x', method: 'external', methodId: 'stripe', amountMinor: 100 }] }]))
      .toStrictEqual([{ session_id: 's1', kind: 'other', method_id: 'external', status: 'captured', amountMinor: 100 }]);
    expect(paymentLedgerRows([{ sessionId: 's1', payments: [{ id: 'y', method: 'cash', methodId: 'cod', amountMinor: 100 }] }]))
      .toStrictEqual([{ session_id: 's1', kind: 'cash', method_id: 'cash', status: 'captured', amountMinor: 100 }]);
  });
});

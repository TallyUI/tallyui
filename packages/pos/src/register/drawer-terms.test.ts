// `deriveDrawerTerms` (TallyUI#716): the drawer ledger behind `deriveExpected`, term by term with
// row counts, as WCPOS v2's `deriveDrawerTerms` gives the register panel. Money is minor units.
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { addPosOrderCollection } from '../pos-order/open';
import type { PosOrder } from '../pos-order/types';
import { deriveDrawerTerms, deriveExpected, type RefundRow } from './expected';
import { addRegisterSessionCollection } from './open';
import { ensureRegister } from './register-document';
import { cashMovementSchema, closureSchema } from './schemas';
import { openSession, recordMovement, type CashMovementCollection, type ClosureCollection, type RegisterSessionCollection } from './session-store';
import { useRegisterSession } from './use-register-session';

const refund = (byMethod: Record<string, number>, overrides: Partial<RefundRow> = {}): RefundRow => ({
  id: 'refund', sessionId: 'session', status: 'applied', result: { byMethod, totalMinor: 0, refunds: [] }, ...overrides,
});

const session = { id: 'session', countedFloatMinor: 10000 };
const input = {
  session,
  ledgerRowsBySession: [
    { session_id: 'session', kind: 'cash', method_id: 'cash', status: 'captured', amountMinor: 5000 },
    { session_id: 'session', kind: 'cash', method_id: 'cash', status: 'captured', amountMinor: 1500 },
    { session_id: 'session', kind: 'cash', method_id: 'cash', status: 'pending', amountMinor: 99900 },
    { session_id: 'session', kind: 'card', method_id: 'card', status: 'captured', amountMinor: 3000 },
    { session_id: 'other', kind: 'cash', method_id: 'cash', status: 'captured', amountMinor: 77700 },
  ],
  movements: [
    { id: 'in', session_id: 'session', type: 'paid_in', amountMinor: 2000 },
    { id: 'out', session_id: 'session', type: 'paid_out', amountMinor: 500 },
    { id: 'gone', session_id: 'session', type: 'paid_out', amountMinor: 700, voided_by: 'void-gone' },
    { id: 'undone', session_id: 'session', type: 'paid_out', amountMinor: 900 },
    { id: 'void-undone', session_id: 'session', type: 'void', amountMinor: 900, voids: 'undone' },
    { id: 'ns-1', session_id: 'session', type: 'no_sale', amountMinor: 0 },
    { id: 'ns-2', session_id: 'session', type: 'no_sale', amountMinor: 0 },
    { id: 'ns-voided', session_id: 'session', type: 'no_sale', amountMinor: 0, voided_by: 'void-ns' },
    { id: 'other-in', session_id: 'other', type: 'paid_in', amountMinor: 4400 },
  ],
  refunds: [refund({ cash: 800 }), refund({ cash: 600 }, { id: 'pending', status: 'pending' })],
};

it('gives each term and its count from the session own captured, standing rows', () => {
  const terms = deriveDrawerTerms(input);
  expect(terms).toMatchObject({
    floatMinor: 10000,
    cashSales: { amountMinor: 6500, count: 2 },
    cashRefunds: { amountMinor: 800, count: 1 },
    paidIn: { amountMinor: 2000, count: 1 },
    paidOut: { amountMinor: 500, count: 1 },
    noSales: 2,
  });
  expect(terms.otherTenders).toStrictEqual({ card: { amountMinor: 3000, count: 1 } });
});

it('holds the invariant, with expected exactly deriveExpected on the same input', () => {
  const terms = deriveDrawerTerms(input);
  expect(terms.expected).toStrictEqual(deriveExpected(input));
  expect(terms.expected.cash).toBe(terms.floatMinor + terms.cashSales.amountMinor - terms.cashRefunds.amountMinor
    + terms.paidIn.amountMinor - terms.paidOut.amountMinor);
  for (const [method, figure] of Object.entries(terms.expected)) {
    if (method !== 'cash') expect(figure).toBe(terms.otherTenders[method]?.amountMinor);
  }
  expect(Object.keys(terms.otherTenders).sort()).toStrictEqual(Object.keys(terms.expected).filter((m) => m !== 'cash').sort());
});

it('gives a card refund with no card sales a negative card term counted once', () => {
  const terms = deriveDrawerTerms({ session, ledgerRowsBySession: [], movements: [], refunds: [refund({ card: 1200 })] });
  expect(terms.otherTenders).toStrictEqual({ card: { amountMinor: -1200, count: 1 } });
  expect(terms.expected).toStrictEqual({ cash: 10000, card: -1200 });
  expect(terms.cashRefunds).toStrictEqual({ amountMinor: 0, count: 0 });
});

it('counts a refund once per method it touches', () => {
  const terms = deriveDrawerTerms({ session, ledgerRowsBySession: [], movements: [], refunds: [refund({ cash: 300, card: 200 })] });
  expect(terms.cashRefunds).toStrictEqual({ amountMinor: 300, count: 1 });
  expect(terms.otherTenders.card).toStrictEqual({ amountMinor: -200, count: 1 });
});

it('takes session sales as cash sales less cash refunds plus the other tenders', () => {
  expect(deriveDrawerTerms(input).sessionSalesMinor).toBe(6500 - 800 + 3000);
});

// `useRegisterSession` exposes the terms from the same rows as its `expected`.
let db: RxDatabase<{
  register_sessions: RegisterSessionCollection; cash_movements: CashMovementCollection; closures: ClosureCollection;
  pos_orders: RxCollection<PosOrder>;
}> | undefined;
afterEach(async () => {
  cleanup();
  await db?.remove();
  db = undefined;
});

it('useRegisterSession gives terms for an open session, with its expected', async () => {
  const created: RxDatabase = await createRxDatabase({
    name: `terms${Math.random().toString(36).slice(2)}`, storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false,
  });
  await created.addCollections({ cash_movements: { schema: cashMovementSchema }, closures: { schema: closureSchema } });
  await addRegisterSessionCollection(created);
  await addPosOrderCollection(created);
  const rx = (db = created as unknown as NonNullable<typeof db>);
  await ensureRegister(rx.register_sessions, 'web');
  const open = await openSession(rx.register_sessions, {
    registerId: 'register', expectedFloatMinor: null, countedFloatMinor: 10000, openedBy: '7', businessDay: { year: 2026, month: 9, day: 20 },
  });
  await recordMovement(rx.register_sessions, rx.cash_movements, rx.closures, { sessionId: open.id, type: 'paid_in', amountMinor: 2000, reason: 'Change', actor: '7' });
  const { result } = renderHook(() => useRegisterSession({
    sessions: rx.register_sessions, movements: rx.cash_movements, closures: rx.closures, orders: rx.pos_orders,
    register: rx.register_sessions, storeKey: 'store', registerId: 'register', enabled: true, actor: { id: '7', name: 'Pat' },
    timezone: 'UTC', softwareVersion: '1.0.0', tenderInProgress: false,
  }));
  await waitFor(() => expect(result.current.terms?.paidIn.count).toBe(1));
  expect(result.current.terms?.expected).toStrictEqual(result.current.expected);
  expect(result.current.expected).toStrictEqual({ cash: 12000 });
});

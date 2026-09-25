// @vitest-environment node
// Ported from WCPOS `next` `3b5331b5c` `closure-store.test.ts` (ADR-032 amendment 1). Money is
// minor units at exponent 2 ('100' becomes 10000), actors are string ids, and a session's sales
// are `PosOrder`s stamped with its `sessionId` instead of WooCommerce order meta.
//
// Dropped (refund attribution is deferred, as in a1's `expected.test.ts`):
//   - 'attributes cross-session split refunds once without importing the parent sale or taxes'
//     (its frozen-snapshot check moved into the first test below)
//   - 'counts distinct legacy refund identities across tenders'
// Changed: no refunds, sale counters (`_wcpos_sale_counter`), per-rate tax breakdown or outbox
// counts (movements and the session are never sent, so only pending orders are unsynced);
// 'retains the actor and movement data ...' no longer builds the closure document (not ported).
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase, type RxCollection } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { REPLICATION_STATE_BY_COLLECTION } from 'rxdb/plugins/replication';
import { startReplication } from '@tallyui/database';
import type { ReplicationAdapter } from '@tallyui/core';
import { createOrderBuilder } from '../order/order-builder';
import { finalizeOrder } from '../pos-order/finalize';
import type { PosOrder, PosOrderPayment } from '../pos-order/types';
import { bindRegister, ensureRegister, nextSaleCounter, readRegister } from './register-document';
import { cashMovementSchema, closureSchema, registerSessionCollection, type CashMovement, type RegisterSession } from './schemas';
import {
  backToSelling,
  closeSession,
  openSession,
  recordMovement,
  RegisterSessionClosedError,
  RegisterSessionRequiredError,
  requireOpenSession,
  voidMovement,
  writeClosure,
  type CashMovementCollection,
  type ClosureCollection,
  type RegisterSessionCollection,
} from './session-store';

let db: RxDatabase<{
  closures: ClosureCollection;
  register_sessions: RegisterSessionCollection;
  cash_movements: CashMovementCollection;
}>;
beforeEach(async () => {
  db = await createRxDatabase({
    name: `closure${Math.random().toString(36).slice(2)}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    multiInstance: false,
  });
  await db.addCollections({
    closures: { schema: closureSchema },
    register_sessions: registerSessionCollection(),
    cash_movements: { schema: cashMovementSchema },
  });
  await ensureRegister(db.register_sessions, 'web');
});
afterEach(async () => {
  await db.remove();
});

/** A hand-built pending sale: only what a closure reads. */
function order(id: string, sessionId: string, payments: Omit<PosOrderPayment, 'id'>[]): PosOrder {
  const total = payments.reduce((sum, payment) => sum + payment.amountMinor, 0);
  return {
    id, commandId: `command-${id}`, createdAt: '2026-09-16T10:00:00.000Z', updatedAt: '2026-09-16T10:00:00.000Z',
    currency: 'EUR', pricesIncludeTax: false, lines: [], subtotalMinor: total, discountMinor: 0, taxMinor: 0,
    totalMinor: total, customer: null, syncStatus: 'pending', sessionId, cashierRef: '7',
    payments: payments.map((payment, i) => ({ ...payment, id: `${id}-payment-${i}` })),
  };
}

async function seed() {
  let session = await openSession(db.register_sessions, {
    registerId: 'register',
    expectedFloatMinor: 10000,
    countedFloatMinor: 10000,
    openedBy: '7',
    businessDay: { year: 2026, month: 9, day: 16 },
  });
  for (const [type, amountMinor] of [
    ['paid_in', 2000],
    ['paid_out', 500],
    ['paid_out', 700],
  ] as const) {
    const row = await recordMovement(db.register_sessions, db.cash_movements, {
      sessionId: session.id,
      type,
      amountMinor,
      reason: '',
      actor: '7',
    });
    if (amountMinor === 700) await voidMovement(db.register_sessions, db.cash_movements, row.id, '7');
  }
  session = await closeSession(db.register_sessions, session.id, {
    counted: { cash: 15000 },
    closedBy: '7',
  });
  const orders = [
    order('order', session.id, [
      { method: 'cash', amountMinor: 5000 },
      { method: 'external', amountMinor: 3000 },
    ]),
    order('other-session', 'other', [{ method: 'cash', amountMinor: 9900 }]),
  ];
  return {
    closures: db.closures,
    register: db.register_sessions,
    storeKey: 'store',
    session,
    counted: 15000,
    otherTenders: {},
    movements: await db.cash_movements.find().exec(),
    orders,
    softwareVersion: '1.0.0',
  };
}
it('freezes the count figures and breakdowns; retries reuse one number and one period increment', async () => {
  const input = await seed();
  const [row, repeated] = await Promise.all([writeClosure(input), writeClosure(input)]);
  expect(repeated.id).toBe(row.id);
  expect(row.toJSON()).toMatchObject({
    number: 1,
    till_expected: { cash: 16500, external: 3000 },
    variance: { cash: -1500 },
    period_sales_total_minor: 8000,
    period_refunds_total_minor: 0,
    perpetual_sales_total_minor: 8000,
    perpetual_refunds_total_minor: 0,
    unsynced_count: 1,
    unsynced_total_minor: 8000,
    order_ids: ['order'],
    software_version: '1.0.0',
    breakdowns: {
      opening_float: { expected_minor: 10000, counted_minor: 10000, variance_minor: 0 },
      transaction_count: 1,
      refund_count: 0,
      cashiers: [{ id: '7', name: '7' }],
      payment_methods: {
        cash: { sales_minor: 5000, refunds_minor: 0 },
        external: { sales_minor: 3000, refunds_minor: 0 },
      },
    },
  });
  expect((await writeClosure(input)).number).toBe(1);
  expect((await readRegister(db.register_sessions))?.stores.store.registers?.register).toMatchObject({
    last_closure_number: 1,
    perpetual_sales_total_minor: 8000,
    perpetual_refunds_total_minor: 0,
  });
  // Removing the existing-closure return would rewrite this frozen snapshot from new inputs.
  const afterDelete = await writeClosure({ ...input, orders: [], movements: [] });
  expect(afterDelete.toJSON()).toEqual(row.toJSON());
});
it('resumes after the insert or perpetual write was interrupted without minting or adding twice', async () => {
  const input = await seed();
  const insert = vi.spyOn(db.closures, 'insert').mockRejectedValueOnce(new Error('disk write'));
  await expect(writeClosure(input)).rejects.toThrow('disk write');
  insert.mockRestore();
  const row = await writeClosure(input);
  expect(row.number).toBe(1);
  expect(await db.closures.count().exec()).toBe(1);
  expect((await readRegister(db.register_sessions))?.stores.store.registers?.register).toMatchObject({
    last_closure_number: 1,
    perpetual_sales_total_minor: 8000,
  });
});

// Revert: omit business_day, closed_by, or snapshot labels when writeClosure builds its draft.
it('copies the opening business day unchanged when closing on a later day', async () => {
  const input = await seed();
  const closure = await writeClosure({
    ...input,
    labels: { register_name: 'Front', closed_by_name: 'Pat' },
  });
  expect(closure.toJSON()).toMatchObject({
    business_day: '2026-09-16',
    closed_by: '7',
    breakdowns: { register_name: 'Front', closed_by_name: 'Pat' },
  });
});
// Revert: discard session actors and movement timestamps before their source rows are pruned.
it('retains the actor and movement data needed by the local closure document', async () => {
  const input = await seed();
  const row = await writeClosure(input);
  expect(row.breakdowns.opened_by).toBe('7');
  const movements = row.breakdowns.movements as Record<string, unknown>[];
  expect(movements[0]).toMatchObject({ created_by: '7', created_at_gmt: expect.any(String) });
  expect(row.closed_by).toBe('7');
});

// Revert: omit business_day when writing a closure for an already-closed legacy session.
it('derives a legacy closure day from opening in store time', async () => {
  const input = await seed();
  const closure = await writeClosure({
    ...input,
    session: {
      ...input.session.toJSON(),
      business_day: undefined,
      opened_at_gmt: '2026-09-17T02:00:00Z',
    },
    ...{ timezone: 'America/Los_Angeles' },
  });
  expect(closure.business_day).toBe('2026-09-16');
});

// TallyUI: the whole Z, from real finalized sales.
it('sums the Z: float plus net cash sales, pay-ins and pay-outs, without the voided pay-out, and other tenders apart', async () => {
  const session = await openSession(db.register_sessions, {
    registerId: 'register', expectedFloatMinor: 10000, countedFloatMinor: 10000, openedBy: '7',
    businessDay: { year: 2026, month: 9, day: 16 },
  });
  const sale = (priceMinor: number, method: 'cash' | 'external', tenderedMinor: number, sessionId = session.id) => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: priceMinor, currency: 'EUR' } });
    builder.addPayment({ method, amountMinor: tenderedMinor });
    return finalizeOrder(builder.getSnapshot(), { registerId: 'register', sessionId, cashierRef: '7' });
  };
  const orders = [sale(2500, 'cash', 2500), sale(1200, 'cash', 2000), sale(3000, 'external', 3000), sale(9900, 'cash', 9900, 'other')];
  expect(orders[1].payments[0]).toMatchObject({ amountMinor: 1200, tenderedMinor: 2000, changeMinor: 800 });
  const move = (type: 'paid_in' | 'paid_out', amountMinor: number) =>
    recordMovement(db.register_sessions, db.cash_movements, {
      sessionId: session.id, type, amountMinor, reason: 'Float', actor: '7',
    });
  await move('paid_in', 500);
  await move('paid_out', 300);
  await voidMovement(db.register_sessions, db.cash_movements, (await move('paid_out', 200)).id, '7');
  const closed = await closeSession(db.register_sessions, session.id, { counted: { cash: 13850 }, closedBy: '7' });
  const closure = await writeClosure({
    closures: db.closures, register: db.register_sessions, storeKey: 'store', session: closed, counted: 13850,
    otherTenders: {}, movements: await db.cash_movements.find().exec(), orders, softwareVersion: '1.0.0',
  });
  expect(closure.toJSON()).toMatchObject({
    till_expected: { cash: 13900, external: 3000 },
    expected: { cash: 13900, external: 3000 },
    counted: { cash: 13850 },
    variance: { cash: -50 },
    period_sales_total_minor: 6700,
    order_ids: orders.slice(0, 3).map((o) => o.id),
    unsynced_count: 3,
    unsynced_total_minor: 6700,
    breakdowns: {
      transaction_count: 3,
      payment_methods: { cash: { sales_minor: 3700, refunds_minor: 0 }, external: { sales_minor: 3000, refunds_minor: 0 } },
    },
  });
  expect(closure.movement_ids).toHaveLength(4);
});

// TallyUI: the three collections are local only (the #53 rule). Every RxDB replication, including
// every `startReplication`, registers its collection in REPLICATION_STATE_BY_COLLECTION (the
// control below shows the probe sees one). After the whole write path, none of the three is there:
// nothing on it starts a replication. What the app itself replicates is its choice; no connector
// has an adapter for these collections.
it('runs the whole session write path without ever replicating its three collections', async () => {
  const input = await seed();
  await writeClosure(input);
  const local: RxCollection[] = [db.register_sessions, db.cash_movements, db.closures];
  expect(local.map((collection) => REPLICATION_STATE_BY_COLLECTION.get(collection))).toEqual([undefined, undefined, undefined]);

  const { scratch } = await db.addCollections({ scratch: { schema: cashMovementSchema } });
  const adapter = { pull: { handler: async () => ({ documents: [], checkpoint: null }) } } as unknown as ReplicationAdapter<unknown>;
  const control = startReplication({
    collection: scratch, adapter, autoStart: false, context: { connectorId: 'test', baseUrl: 'https://store.test', headers: {} },
  });
  expect(REPLICATION_STATE_BY_COLLECTION.get(scratch)).toEqual([control]);
  await control.cancel();
});

const open = (registerId = 'register') =>
  openSession(db.register_sessions, {
    registerId, expectedFloatMinor: 10000, countedFloatMinor: 10000, openedBy: '7', businessDay: { year: 2026, month: 9, day: 16 },
  });
const z = (session: RegisterSession, extra: { counted?: number; orders?: PosOrder[]; movements?: CashMovement[] } = {}) =>
  writeClosure({
    closures: db.closures, register: db.register_sessions, storeKey: 'store', session, counted: extra.counted ?? 10000,
    otherTenders: {}, movements: extra.movements ?? [], orders: extra.orders ?? [], softwareVersion: '1.0.0',
  });

// TallyUI (#123 review): close, Z #1, reopen, then a 2,500 sale and a 700 pay-out fell off every
// Z. The closed session now refuses both, so they land in the next session and on Z #2.
it('never leaves a sale or a pay-out taken after a close off every Z report', async () => {
  const input = await seed();
  const z1 = await writeClosure(input);
  await expect(backToSelling(db.register_sessions, input.session.id)).rejects.toBeInstanceOf(RegisterSessionClosedError);
  // A sale's sessionId comes from requireOpenSession, which gives out no closed session.
  await expect(requireOpenSession(db.register_sessions, 'register', true)).rejects.toBeInstanceOf(RegisterSessionRequiredError);
  const payOut = (sessionId: string) =>
    recordMovement(db.register_sessions, db.cash_movements, {
      sessionId, type: 'paid_out', amountMinor: 700, reason: '', actor: '7',
    });
  await expect(payOut(input.session.id)).rejects.toBeInstanceOf(RegisterSessionClosedError);

  const next = await open();
  const sessionId = (await requireOpenSession(db.register_sessions, 'register', true))!;
  expect(sessionId).toBe(next.id);
  await payOut(sessionId);
  const closed = await closeSession(db.register_sessions, sessionId, { counted: { cash: 11800 }, closedBy: '7' });
  const orders = [...input.orders, order('late-sale', sessionId, [{ method: 'cash', amountMinor: 2500 }])];
  const z2 = await z(closed, { counted: 11800, orders, movements: await db.cash_movements.find().exec() });
  expect(z2.toJSON()).toMatchObject({
    number: 2, order_ids: ['late-sale'], period_sales_total_minor: 2500, till_expected: { cash: 11800 }, variance: { cash: 0 },
  });
  expect(z2.breakdowns.movements).toMatchObject([{ type: 'paid_out', amountMinor: 700 }]);
  expect((await writeClosure(input)).toJSON()).toEqual(z1.toJSON());
});

// TallyUI (#123 review, F3). Revert: drop writeClosure's closed-session check.
it('refuses a closure for a session that is not closed, without minting a number', async () => {
  const session = await open();
  const before = await readRegister(db.register_sessions);
  await expect(z(session)).rejects.toThrow('register_session_not_closed');
  await expect(z({ ...session.toJSON(), status: 'closed' })).rejects.toThrow('register_session_not_closed');
  expect(await readRegister(db.register_sessions)).toEqual(before);
  expect(await db.closures.count().exec()).toBe(0);
});

// The register document is a local document on register_sessions, so it never meets a session row.
it('keeps the register document and a session with the id "register" apart', async () => {
  const register = await readRegister(db.register_sessions);
  const session = await db.register_sessions.insert({ ...(await open()).toJSON(), id: 'register' });
  const closure = await z(await closeSession(db.register_sessions, session.id, { counted: { cash: 10000 } }));
  expect(closure.toJSON()).toMatchObject({ id: 'register', number: 1 });
  expect(await readRegister(db.register_sessions)).toMatchObject({
    id: register!.id, stores: { store: { registers: { register: { last_closure_number: 1 } } } },
  });
  expect((await db.register_sessions.findOne('register').exec())?.status).toBe('closed');
});

// TallyUI (registers job c review, F2): recordMovement re-reads after the insert, so a close
// that lands in the gap can't leave a movement off the Z it should be on. Revert: drop the
// re-read after the insert.
it('refuses and removes a movement whose session closes in the gap between the insert and the re-read', async () => {
  const session = await open();
  const insert = db.cash_movements.insert.bind(db.cash_movements);
  db.cash_movements.insert = (async (doc: Parameters<typeof insert>[0]) => {
    const row = await insert(doc);
    // Lands the close inside the window recordMovement's insert is awaiting, before its re-read.
    await closeSession(db.register_sessions, session.id, { counted: { cash: 10000 }, closedBy: '7' });
    return row;
  }) as typeof db.cash_movements.insert;
  await expect(
    recordMovement(db.register_sessions, db.cash_movements, {
      sessionId: session.id, type: 'paid_out', amountMinor: 700, reason: 'Milk', actor: '7',
    }),
  ).rejects.toBeInstanceOf(RegisterSessionClosedError);
  expect(await db.cash_movements.count().exec()).toBe(0);
  const closed = (await db.register_sessions.findOne(session.id).exec())!;
  const closure = await z(closed, { movements: await db.cash_movements.find().exec() });
  expect(closure.movement_ids).toEqual([]);
});

// Each till's register document keeps its own sale counter; each register its own closure numbers.
it('counts two registers in one store on their own: sale counters and closure numbers', async () => {
  const back = await createRxDatabase({
    name: `closure${Math.random().toString(36).slice(2)}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    multiInstance: false,
  });
  const { register_sessions: backTill } = await back.addCollections({ register_sessions: registerSessionCollection() });
  await ensureRegister(backTill, 'web');
  await bindRegister(db.register_sessions, 'store', { id: 'front', name: 'Front' });
  await bindRegister(backTill, 'store', { id: 'back', name: 'Back' });
  const counters = [];
  for (const till of [db.register_sessions, db.register_sessions, backTill, db.register_sessions]) {
    counters.push(await nextSaleCounter(till, 'store'));
  }
  expect(counters).toEqual([1, 2, 1, 3]);
  await back.remove();
  const close = async (registerId: string) =>
    (await z(await closeSession(db.register_sessions, (await open(registerId)).id, { counted: { cash: 10000 } }))).number;
  expect([await close('front'), await close('back'), await close('front'), await close('back')]).toEqual([1, 1, 2, 2]);
});

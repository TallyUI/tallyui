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
import { ensureRegister, readRegister } from './register-document';
import { cashMovementSchema, closureSchema, registerSessionCollection } from './schemas';
import {
  closeSession,
  openSession,
  recordMovement,
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
    const row = await recordMovement(db.cash_movements, {
      sessionId: session.id,
      type,
      amountMinor,
      reason: '',
      actor: '7',
    });
    if (amountMinor === 700) await voidMovement(db.cash_movements, row.id, '7');
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
    recordMovement(db.cash_movements, { sessionId: session.id, type, amountMinor, reason: 'Float', actor: '7' });
  await move('paid_in', 500);
  await move('paid_out', 300);
  await voidMovement(db.cash_movements, (await move('paid_out', 200)).id, '7');
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

// @vitest-environment node
// `addPosOrderCollection` on SQLite, the production storage, where a close can interrupt a
// migration that RxDB's own open path leaves running (ADR-032 amendment 2), from version 0, 1, 2 and 3;
// and the order outbox restoring a stored serverFailures there.
import { describe, expect, it, vi } from 'vitest';
import { createRxDatabase, fillWithDefaultSettings, normalizeMangoQuery, prepareQuery } from 'rxdb';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { OrderCreateEnvelope } from '@tallyui/core';
import { createOrderOutbox, type OrderOutbox } from '@tallyui/pos/outbox/order-outbox';
import type { CommandTransport } from '@tallyui/pos/outbox/types';
import { addPosOrderCollectionTests, olderCollection } from '@tallyui/pos/pos-order/open.test-helper';
import { createOrderBuilder } from '@tallyui/pos/order/order-builder';
import { mintUuid } from '@tallyui/pos/register/register-document';
import { finalizeOrder } from '@tallyui/pos/pos-order/finalize';
import { addPosOrderCollection } from '@tallyui/pos/pos-order/open';
import type { PosOrder } from '@tallyui/pos/pos-order/types';
import { uuidv7 } from '@tallyui/pos/pos-order/uuidv7';
import { loadSQLiteStorage, openNodeSQLite } from '@tallyui/storage-sqlite/node-sqlite.test-helper';

const getRxStorageSQLite = await loadSQLiteStorage();
if (!getRxStorageSQLite && process.env.CI) {
  it('requires rxdb-premium in CI', () => { throw new Error('rxdb-premium is missing in CI'); });
}

// One SQLite handle per test: it serves one database name.
(getRxStorageSQLite ? describe : describe.skip)('addPosOrderCollection on SQLite storage', () =>
  addPosOrderCollectionTests(() => getRxStorageSQLite!(openNodeSQLite().database), { sqlite: true }));

// The same tests from version 1 (a version-1 order carries its sessionId) to the current version.
(getRxStorageSQLite ? describe : describe.skip)('addPosOrderCollection on SQLite storage from version 1', () =>
  addPosOrderCollectionTests(() => getRxStorageSQLite!(openNodeSQLite().database), { sqlite: true, from: 1 }));

(getRxStorageSQLite ? describe : describe.skip)('addPosOrderCollection on SQLite storage from version 2', () =>
  addPosOrderCollectionTests(() => getRxStorageSQLite!(openNodeSQLite().database), { sqlite: true, from: 2 }));

(getRxStorageSQLite ? describe : describe.skip)('addPosOrderCollection on SQLite storage from version 3', () =>
  addPosOrderCollectionTests(() => getRxStorageSQLite!(openNodeSQLite().database), { sqlite: true, from: 3 }));

/** A pending version-3 order with every optional field set: sent at order.create version 3, answered, then downgraded to 2. */
function versionThreeOrder(): PosOrder {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 190000, pricesIncludeTax: false } });
  builder.addLine({ productId: 'p1', variantId: 'v1', name: 'Item 1', sku: 'SKU1', unitPrice: { amount: 850, currency: 'EUR' }, quantity: 2,
    taxRates: [{ code: 'VAT', ratePpm: 190000 }] });
  builder.addLine({ productId: 'p2', name: 'Item 2', unitPrice: { amount: 1200, currency: 'EUR' } });
  builder.addPayment({ method: 'external', amountMinor: 1000, reference: 'terminal' });
  builder.addPayment({ method: 'cash', amountMinor: 3000 });
  builder.setCustomer({ id: 'c1', name: 'Customer', email: 'buyer@example.com' });
  builder.setNote('Sale note');
  const order = finalizeOrder(builder.getSnapshot(), { registerId: 'r1', cashierRef: 'staff1', capabilities: { orderCreate: 3 } });
  return { ...order, lines: [{ ...order.lines[0], taxInclusive: true }, order.lines[1]],
    sessionId: mintUuid(), lateSessionId: mintUuid(), sentVersion: 2, downgradedFrom: 3,
    serverRefs: { orderId: 'server-1', displayId: '#1001', totalMinor: order.totalMinor },
    warnings: [{ code: 'total_mismatch', expectedMinor: 3451, serverMinor: 3452 }], error: { code: 'network', message: 'fetch failed' } };
}

(getRxStorageSQLite ? it : it.skip).each([true, false])(
  'keeps a pending version-3 order with every optional field set byte for byte through the migration to the current version (validated: %s)',
  async (validated) => {
    const handle = openNodeSQLite();
    const storage = getRxStorageSQLite!(handle.database);
    const name = `posorder${uuidv7().replaceAll('-', '')}`;
    const original = versionThreeOrder();
    const optional = ['note', 'registerId', 'sessionId', 'cashierRef', 'serverRefs', 'warnings', 'error', 'lateSessionId', 'sentVersion',
      'downgradedFrom', 'display', 'taxByRate'];
    for (const key of optional) expect(original, key).toHaveProperty(key);
    expect(original.payments.map((payment) => Object.keys(payment).sort())).toEqual([
      ['amountMinor', 'id', 'method', 'reference'], ['amountMinor', 'changeMinor', 'id', 'method', 'tenderedMinor']]);

    const older = await createRxDatabase({ name, storage, multiInstance: false });
    const metadata = (await (await older.addCollections({ pos_orders: olderCollection(3) })).pos_orders.insert(structuredClone(original)))
      .toJSON(true)._meta;
    await older.close();

    const db = await createRxDatabase({ name, storage: validated ? wrappedValidateAjvStorage({ storage }) : storage, multiInstance: false });
    try {
      const orders = await addPosOrderCollection(db);
      const migrated = await orders.findOne(original.id).exec();
      expect(migrated?.toJSON()).toStrictEqual(original);
      expect(migrated?.toJSON(true)._meta).toStrictEqual(metadata);
      const pending = await orders.find({ selector: { syncStatus: 'pending' }, sort: [{ createdAt: 'asc' }] }).exec();
      expect(pending.map((doc) => doc.toJSON())).toStrictEqual([original]);
    } finally {
      await db.close();
    }
    // Nothing is left in the version-3 storage.
    const raw = await storage.createStorageInstance<PosOrder>({ databaseName: name, collectionName: 'pos_orders',
      schema: fillWithDefaultSettings(olderCollection(3).schema), options: {}, multiInstance: false, devMode: false, databaseInstanceToken: 'check' });
    try {
      expect(await raw.findDocumentsById([original.id], true)).toEqual([]);
    } finally {
      await raw.close();
      handle.raw.close();
    }
  });

(getRxStorageSQLite ? it : it.skip)('version 4 to 5 records each unrecorded order at its content version, and keeps a downgraded one', async () => {
  const handle = openNodeSQLite();
  const storage = getRxStorageSQLite!(handle.database);
  const name = `posorder${uuidv7().replaceAll('-', '')}`;
  const { sentVersion: _sent, downgradedFrom: _from, ...figures } = { ...versionThreeOrder(), id: uuidv7(), commandId: uuidv7() };
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
  builder.applyLineDiscount(builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 500, currency: 'EUR' } }),
    { type: 'fixed', value: 100 });
  builder.addPayment({ method: 'cash', amountMinor: 400 });
  const discounted = finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 2 } });
  const downgraded = versionThreeOrder();
  expect(figures.display && figures.taxByRate && !discounted.display && discounted.lines[0].discountMinor > 0).toBeTruthy();
  const older = await createRxDatabase({ name, storage, multiInstance: false });
  await (await older.addCollections({ pos_orders: olderCollection(4) })).pos_orders.bulkInsert(structuredClone([figures, discounted, downgraded]));
  await older.close();
  const db = await createRxDatabase({ name, storage: wrappedValidateAjvStorage({ storage }), multiInstance: false });
  try {
    const orders = await addPosOrderCollection(db);
    expect(orders.schema.version).toBe(5);
    const byId = async (id: string) => (await orders.findOne(id).exec())?.toJSON();
    expect(await byId(figures.id)).toStrictEqual({ ...figures, sentVersion: 3 });
    expect(await byId(discounted.id)).toStrictEqual({ ...discounted, sentVersion: 2 });
    expect(await byId(downgraded.id)).toStrictEqual(downgraded);
    expect(downgraded).toMatchObject({ sentVersion: 2, downgradedFrom: 3 });
  } finally {
    await db.close();
    handle.raw.close();
  }
});

(getRxStorageSQLite ? it : it.skip)('finds orders by sessionId through its index, and never returns an unstamped order', async () => {
  const db = await createRxDatabase({ name: `posorder${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageSQLite!(openNodeSQLite().database) }), multiInstance: false });
  try {
    const orders = await addPosOrderCollection(db);
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 100, currency: 'EUR' } });
    builder.addPayment({ method: 'cash', amountMinor: 100 });
    const order = finalizeOrder(builder.getSnapshot());
    const inserted = await orders.bulkInsert([
      { ...order, id: 'stamped-a', sessionId: 'a' }, { ...order, id: 'stamped-b', sessionId: 'b' },
      { ...order, id: 'unstamped' }, { ...order, id: 'late', lateSessionId: 'a' },
    ]);
    expect(inserted.error).toEqual([]);
    const queries: Array<[string | { $in: string[] }, string[], string[]]> = [
      ['a', ['stamped-a'], ['_deleted', 'sessionId', 'id']],
      // RxDB 17's planner uses a field's index for `$in` too (rxdb#8631).
      [{ $in: ['a', 'b'] }, ['stamped-a', 'stamped-b'], ['_deleted', 'sessionId', 'id']],
    ];
    for (const [sessionId, ids, index] of queries) {
      const query = orders.find({ selector: { sessionId } });
      expect((await query.exec()).map((doc) => doc.id).sort()).toEqual(ids);
      const schema = orders.schema.jsonSchema;
      expect(prepareQuery(schema, normalizeMangoQuery(schema, query.getPreparedQuery().query)).queryPlan.index).toEqual(index);
    }
  } finally {
    await db.remove();
  }
});

(getRxStorageSQLite ? it : it.skip)('restores an isolated order from its stored serverFailures: the first send is a batch without it, then it goes alone', async () => {
  const db = await createRxDatabase({ name: `posorder${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageSQLite!(openNodeSQLite().database) }), multiInstance: false });
  let outbox: OrderOutbox | undefined;
  try {
    const orders = await addPosOrderCollection(db);
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 100, currency: 'EUR' } });
    builder.addPayment({ method: 'cash', amountMinor: 100 });
    const order = finalizeOrder(builder.getSnapshot());
    const createdAt = (i: number) => new Date(Date.parse(order.createdAt) + i * 1000).toISOString();
    const bad = { ...order, id: uuidv7(), commandId: uuidv7(), createdAt: createdAt(0),
      serverFailures: { since: Date.now() - 60_000, reason: 'status_503', isolated: true } };
    const good = { ...order, id: uuidv7(), commandId: uuidv7(), createdAt: createdAt(1) };
    expect((await orders.bulkInsert([bad, good])).error).toEqual([]);
    // The store answers 503 for any batch holding the stored order, and applies every other batch.
    const send = vi.fn<CommandTransport<OrderCreateEnvelope>['send']>(async (batch) => batch.some((command) => command.id === bad.commandId)
      ? { kind: 'retry', reason: 'status_503' }
      : { kind: 'results', results: batch.map((command) => ({ id: command.id, status: 'applied' as const,
        serverRefs: { orderId: `server-${command.id}`, totalMinor: command.payload.totalMinor } })) });
    outbox = createOrderOutbox({ collection: orders, transport: { send }, deviceId: 'sqlite-restore', random: () => 0.5 });
    await outbox.flush();
    expect(send.mock.calls.map(([batch]) => batch.map((command) => command.id))).toEqual([[good.commandId], [bad.commandId]]);
    expect((await orders.findOne(good.id).exec())!.syncStatus).toBe('applied');
    expect((await orders.findOne(bad.id).exec())!.toJSON()).toMatchObject({ syncStatus: 'pending',
      serverFailures: { reason: 'status_503', isolated: true } });
  } finally {
    outbox?.stop();
    await db.remove();
  }
});

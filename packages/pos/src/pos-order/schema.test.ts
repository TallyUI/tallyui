// @vitest-environment node
import { expect, it } from 'vitest';
import { createRxDatabase, normalizeMangoQuery, prepareQuery } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { createOrderBuilder } from '../order/order-builder';
import { finalizeOrder } from './finalize';
import { addPosOrderCollection } from './open';
import { posOrderCollection, posOrderSchema } from './schema';
import { uuidv7 } from './uuidv7';

it('inserts a finalised order into an AJV-validated RxDB memory collection', async () => {
  const db = await createRxDatabase({ name: `posorder${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  try {
    const { pos_orders } = await db.addCollections({ pos_orders: posOrderCollection() });
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 190000, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p1', variantId: 'v1', name: 'Item 1', unitPrice: { amount: 850, currency: 'EUR' }, quantity: 2,
      taxRates: [{ code: 'VAT', ratePpm: 190000 }] });
    builder.addLine({ productId: 'p2', name: 'Item 2', unitPrice: { amount: 1200, currency: 'EUR' } });
    builder.addPayment({ method: 'external', amountMinor: 1000, reference: 'terminal' });
    builder.addPayment({ method: 'cash', amountMinor: 3000 });
    builder.setCustomer({ id: 'c1', name: 'Customer', email: 'buyer@example.com' });
    builder.setNote('Sale note');
    const order = finalizeOrder(builder.getSnapshot(), { registerId: 'r1', cashierRef: 'staff1' });
    const doc = await pos_orders.insert(order);
    expect(doc.toJSON()).toStrictEqual(order);
    await pos_orders.insert({ ...order, id: uuidv7(), syncStatus: 'applied', customer: null,
      serverRefs: { orderId: 'server1', displayId: '301', totalMinor: 3451 },
      warnings: [{ code: 'total_mismatch', expectedMinor: 3451, serverMinor: 3452 }, { code: 'insufficient_stock', variantId: 'v1', quantity: 2 }],
    });
    await pos_orders.insert({ ...order, id: uuidv7(), syncStatus: 'rejected', error: { code: 'invalid', message: 'Rejected' } });
    const warnings = [{ code: 'new_code', foo: 1, nested: { extra: ['accepted'] } }];
    const unknown = await pos_orders.insert({ ...order, id: uuidv7(), syncStatus: 'applied', warnings });
    expect(unknown.toJSON().warnings).toEqual(warnings);
    const v4 = { ...order, id: uuidv7(), localWarnings: [{ code: 'customer_omitted' as const, field: 'email' as const },
      { code: 'payment_reference_dropped' as const, paymentId: order.payments[0].id }], serverFailures: { since: 0, reason: 'server_error', isolated: true } };
    expect((await pos_orders.insert(v4)).toJSON()).toStrictEqual(v4);
    await expect(pos_orders.insert({ ...order, id: uuidv7(), serverFailures: { since: 0, reason: 'server_error' } })).rejects.toThrow();
    await expect(pos_orders.insert({ ...order, id: uuidv7(),
      serverFailures: { count: 1, since: 0, reason: 'server_error', isolated: false } })).rejects.toThrow();
    await expect(pos_orders.insert({ ...order, id: uuidv7(), warnings: [{ code: 'x'.repeat(65) }] })).rejects.toThrow();
    await expect(pos_orders.insert({ ...order, id: uuidv7(), syncStatus: 'invalid' })).rejects.toThrow();
    await expect(pos_orders.insert({ ...order, id: uuidv7(), extra: true })).rejects.toThrow();
    expect(posOrderSchema.indexes).toEqual(['createdAt', 'syncStatus', ['syncStatus', 'createdAt'], 'sessionId']);
    expect(posOrderSchema.properties.sessionId.maxLength).toBe(36);
  } finally {
    await db.remove();
  }
});

it("stores a line's taxInclusive (ADR-038 amendment) without a schema version bump, because lines.items already accepts unknown properties", async () => {
  // `taxInclusive` needed no version bump: the `lines` item schema never set additionalProperties to
  // false, so it already accepts (and round-trips) a property it does not declare — the same as
  // the `warnings` items above, which declare it explicitly. Adding `taxInclusive` to PosOrderLine
  // needs no matching schema edit, so there is nothing to migrate. (Version 1 is the top-level
  // `sessionId`, ADR-032; version 2 adds `lateSessionId`, `display` and `taxByRate`; version 3 indexes `sessionId`; see migration.test.ts.)
  expect(posOrderSchema.version).toBe(4);
  expect(posOrderSchema.properties.lines.items).not.toHaveProperty('additionalProperties');
  const db = await createRxDatabase({ name: `posorder${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  try {
    const { pos_orders } = await db.addCollections({ pos_orders: posOrderCollection() });
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 190000, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p1', name: 'Item 1', unitPrice: { amount: 850, currency: 'EUR' } });
    builder.addPayment({ method: 'cash', amountMinor: 2000 });
    const order = finalizeOrder(builder.getSnapshot());
    const withLineTaxMode = { ...order, lines: [{ ...order.lines[0], taxInclusive: true }] };
    const doc = await pos_orders.insert(withLineTaxMode);
    expect(doc.toJSON().lines[0].taxInclusive).toBe(true);
  } finally {
    await db.remove();
  }
});

it('stores sentVersion and downgradedFrom, and refuses values outside 1–3', async () => {
  const db = await createRxDatabase({ name: `posorder${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  try {
    const { pos_orders } = await db.addCollections({ pos_orders: posOrderCollection() });
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 100, currency: 'EUR' } });
    builder.addPayment({ method: 'cash', amountMinor: 100 });
    const order = { ...finalizeOrder(builder.getSnapshot()), sentVersion: 2 as const, downgradedFrom: 3 as const };
    await pos_orders.insert(order);
    expect((await pos_orders.findOne(order.id).exec())?.toJSON()).toStrictEqual(order);
    await expect(pos_orders.insert({ ...order, id: uuidv7(), sentVersion: 4 })).rejects.toThrow();
    await expect(pos_orders.insert({ ...order, id: uuidv7(), sentVersion: 0 })).rejects.toThrow();
  } finally {
    await db.remove();
  }
});

it('finds orders by sessionId through its index, and never returns an unstamped order', async () => {
  const db = await createRxDatabase({ name: `posorder${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
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

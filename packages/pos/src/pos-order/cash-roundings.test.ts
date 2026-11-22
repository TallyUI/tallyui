// @vitest-environment node
// ADR-094: cash rounding is an order field. The finalize gate, order.create 13, pos_orders 21 and the server's shape check.
import { describe, expect, it } from 'vitest';
import { createRxDatabase, fillWithDefaultSettings, type RxCollectionCreator, type RxStorage } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { payloadShapeErrors } from '@tallyui/core/server';
import { createOrderBuilder } from '../order/order-builder';
import { toOrderCreateEnvelope } from './command';
import { finalizeOrder } from './finalize';
import { addPosOrderCollection } from './open';
import { addPosOrderCollectionTests, olderCollection } from './open.test-helper';
import type { PosOrder } from './types';
import { uuidv7 } from './uuidv7';

/** R1's sale at builder level: 3125, taken as one cash leg of 3130 with its +5 entry. */
function rounded() {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
  builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: 3125, currency: 'EUR' } });
  builder.addPayment({ method: 'cash', amountMinor: 3130, tenderedMinor: 3130, changeMinor: 0 }, { minor: 5 });
  return builder.getSnapshot();
}

it('F1: finalize refuses a rounded sale for a store below order.create 13', () => {
  expect(() => finalizeOrder(rounded(), { capabilities: { orderCreate: 12 } })).toThrow(
    "finalize: cash rounding needs the store to accept order.create version 13; update the store's TallyUI plugin");
});

it('F2: at cap 13 the envelope carries the entries at version 13', () => {
  const posOrder = finalizeOrder(rounded(), { capabilities: { orderCreate: 13 } });
  expect(posOrder).toMatchObject({ totalMinor: 3130, cashRoundings: [{ paymentId: posOrder.payments[0].id, minor: 5 }] });
  const envelope = toOrderCreateEnvelope(posOrder, 'device-1', 1, { maxVersion: 13 });
  expect(envelope.version).toBe(13);
  expect(envelope.payload.cashRoundings).toEqual([{ paymentId: posOrder.payments[0].id, minor: 5 }]);
  expect(envelope.payload.totalMinor).toBe(3130);
  expect(envelope.payload.payments).toEqual([expect.objectContaining({ clientPaymentId: posOrder.payments[0].id, amountMinor: 3130 })]);
});

// migration.test.ts's own helpers.
async function open(name: string, storage: RxStorage<any, any>, collection: RxCollectionCreator) {
  const db = await createRxDatabase({ name, storage, multiInstance: false });
  return { db, added: db.addCollections({ pos_orders: collection }) };
}
async function olderDocument(storage: RxStorage<any, any>, databaseName: string, id: string) {
  const raw = await storage.createStorageInstance<PosOrder>({ databaseName, collectionName: 'pos_orders',
    schema: fillWithDefaultSettings(olderCollection(20).schema), options: {}, multiInstance: false, devMode: false, databaseInstanceToken: 'check' });
  const [doc] = await raw.findDocumentsById([id], false);
  await raw.close();
  return doc;
}

describe('from version 20', () => {
  describe('addPosOrderCollection on memory storage', () => addPosOrderCollectionTests(() => getRxStorageMemory(), { from: 20 }));

  it('F3: keeps pending and applied version-20 orders byte for byte at 21, then stores cash roundings', async () => {
    const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 190000, pricesIncludeTax: true } });
    builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: 1190, currency: 'EUR' } });
    builder.addPayment({ method: 'external', methodId: 'card', amountMinor: 500, reference: 'ref-1', takenAt: '2026-11-22T10:15:00.000Z' });
    builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor - 500 });
    const pending = finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 12 } });
    const applied: PosOrder = { ...pending, id: uuidv7(), syncStatus: 'applied', serverRefs: { orderId: 'server-1', totalMinor: pending.totalMinor } };
    const name = `posmigrate${uuidv7().replaceAll('-', '')}`, before = await open(name, storage, olderCollection(20));
    expect((await (await before.added).pos_orders.bulkInsert(structuredClone([pending, applied]))).error).toEqual([]);
    await before.db.close();
    const originals = await Promise.all([pending, applied].map((original) => olderDocument(storage, name, original.id)));
    const db = await createRxDatabase({ name, storage, multiInstance: false });
    try {
      const orders = await addPosOrderCollection(db);
      expect(orders.schema.version).toBe(21);
      for (const [index, original] of [pending, applied].entries()) {
        const migrated = await orders.findOne(original.id).exec();
        expect(migrated?.toJSON()).toStrictEqual(original);
        expect(migrated?.toJSON(true)._meta).toEqual(originals[index]._meta);
      }
      const withRounding = finalizeOrder(rounded(), { capabilities: { orderCreate: 13 } });
      await orders.insert(withRounding);
      expect((await orders.findOne(withRounding.id).exec())?.toJSON()).toStrictEqual(withRounding);
      expect(withRounding.cashRoundings).toEqual([{ paymentId: withRounding.payments[0].id, minor: 5 }]);
    } finally { await db.remove(); }
  });
});

describe('F4: the server shape check for cashRoundings', () => {
  const payload = {
    clientOrderId: 'order_1', createdAt: '2026-11-19T10:00:00Z', currency: 'EUR', pricesIncludeTax: true,
    lines: [{ clientLineId: 'line_1', variantId: 'variant_1', title: 'Coffee', quantity: 1, unitPriceMinor: 1000 }],
    subtotalMinor: 840, taxMinor: 160, totalMinor: 1000, payments: [{ clientPaymentId: 'payment_1', method: 'cash', amountMinor: 1000 }],
    customer: { email: 'ann@example.com', customerId: '42' },
  };

  it('accepts a negative and a positive minor', () => {
    expect(payloadShapeErrors({ ...payload, cashRoundings: [{ paymentId: 'payment_1', minor: -2 }] })).toEqual([]);
    expect(payloadShapeErrors({ ...payload, cashRoundings: [{ paymentId: 'payment_1', minor: 5 }] })).toEqual([]);
  });

  it('refuses a non-integer minor, an empty id and 17 entries', () => {
    expect(payloadShapeErrors({ ...payload, cashRoundings: [{ paymentId: 'payment_1', minor: 1.5 }] }))
      .toEqual(['cashRoundings[0].minor: expected a safe integer']);
    expect(payloadShapeErrors({ ...payload, cashRoundings: [{ paymentId: '', minor: 5 }] }))
      .toEqual(['cashRoundings[0].paymentId: expected a non-empty string']);
    expect(payloadShapeErrors({ ...payload, cashRoundings: Array.from({ length: 17 }, () => ({ paymentId: 'payment_1', minor: 1 })) }))
      .toEqual(['cashRoundings: expected an array of at most 16 entries']);
  });
});

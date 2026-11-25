// @vitest-environment node
// #1101 slice 1b: pos_orders 22 stores a refused sale's store settlement; which rows the till may cancel on the store.
import { describe, expect, it } from 'vitest';
import { createRxDatabase, fillWithDefaultSettings } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { addPosOrderCollection } from './open';
import { addPosOrderCollectionTests, olderCollection } from './open.test-helper';
import { canCancelOnStore, settledOnStore } from './store-settlement';
import type { PosOrder, PosOrderStoreSettlement } from './types';
import { uuidv7 } from './uuidv7';

function refused(overrides: Partial<PosOrder> = {}, data: Record<string, unknown> = { orderId: '115', displayId: '1001' }): PosOrder {
  const createdAt = '2026-11-25T09:00:00.000Z';
  return {
    id: uuidv7(), commandId: uuidv7(), createdAt, updatedAt: createdAt, currency: 'EUR', pricesIncludeTax: false,
    lines: [{ id: uuidv7(), productId: 'p', name: 'Item', sku: 'SKU', quantity: 1, unitPriceMinor: 1000, discountMinor: 0, netMinor: 1000, taxLines: [] }],
    payments: [{ id: uuidv7(), method: 'cash', amountMinor: 1000 }], customer: null,
    subtotalMinor: 1000, discountMinor: 0, taxMinor: 0, totalMinor: 1000, syncStatus: 'rejected',
    error: { code: 'invalid_payload', message: 'created, not paid', data }, taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' },
    ...overrides,
  };
}
const settlement = (state: PosOrderStoreSettlement['state'], kind: PosOrderStoreSettlement['kind'] = 'cancel'): PosOrderStoreSettlement =>
  ({ kind, state, attemptId: uuidv7(), at: '2026-11-25T10:00:00.000Z' });

describe('canCancelOnStore', () => {
  it.each<[string, PosOrder, boolean]>([
    ['a refused sale the store created with nothing recorded', refused(), true],
    ['14: a total_mismatch refusal with the store order', refused({}, { storeCode: 'total_mismatch', orderId: '115' }), true],
    ['recorded 0', refused({}, { orderId: '115', recorded: 0 }), true],
    ['7: recorded 1 (the first payment)', refused({}, { orderId: '115', recorded: 1 }), false],
    ['no orderId', refused({}, { storeCode: 'x' }), false],
    ['pending', refused({ syncStatus: 'pending' }), false],
    ['applied with a storeOrderId', refused({ syncStatus: 'applied', storeOrderId: '115' }), false],
    ['a cancel still sending', refused({ storeSettlement: settlement('sending') }), true],
    ['a cancel the store changed', refused({ storeSettlement: settlement('changed') }), true],
    ['a cancel the store refused', refused({ storeSettlement: settlement('refused') }), true],
    ['9: a cancel done', refused({ storeSettlement: settlement('done') }), false],
    ['9: a cancel gone', refused({ storeSettlement: settlement('gone') }), false],
    ['10: a pay still sending', refused({ storeSettlement: settlement('sending', 'pay') }), false],
    ['a reverse the store refused', refused({ storeSettlement: settlement('refused', 'reverse') }), true],
  ])('%s', (_name, order, expected) => {
    expect(canCancelOnStore(order)).toBe(expected);
  });
});

describe('settledOnStore', () => {
  it.each<[PosOrderStoreSettlement['state'] | undefined, boolean]>([
    [undefined, false], ['sending', false], ['changed', false], ['refused', false], ['done', true], ['gone', true],
  ])('%s: %s', (state, expected) => {
    expect(settledOnStore({ storeSettlement: state ? settlement(state) : undefined })).toBe(expected);
  });
});

type Storage = Parameters<typeof createRxDatabase>[0]['storage'];
async function olderDocument(storage: Storage, databaseName: string, id: string) {
  const raw = await storage.createStorageInstance<PosOrder>({ databaseName, collectionName: 'pos_orders',
    schema: fillWithDefaultSettings(olderCollection(21).schema), options: {}, multiInstance: false, devMode: false, databaseInstanceToken: 'check' });
  const [doc] = await raw.findDocumentsById([id], false);
  await raw.close();
  return doc;
}

describe('from version 21', () => {
  describe('addPosOrderCollection on memory storage', () => addPosOrderCollectionTests(() => getRxStorageMemory(), { from: 21 }));

  it('keeps a version-21 refused sale byte for byte at 22, then stores its settlement through a close and reopen', async () => {
    const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
    const order = refused({}, { orderId: '115', displayId: '1001', recorded: 0 });
    const name = `possettle${uuidv7().replaceAll('-', '')}`;
    const before = await createRxDatabase({ name, storage, multiInstance: false });
    await (await before.addCollections({ pos_orders: olderCollection(21) })).pos_orders.insert(structuredClone(order));
    await before.close();
    const original = await olderDocument(storage, name, order.id);
    const done: PosOrderStoreSettlement = { ...settlement('done'), storeStatus: 'cancelled' };
    let db = await createRxDatabase({ name, storage, multiInstance: false });
    try {
      let orders = await addPosOrderCollection(db);
      expect(orders.schema.version).toBe(22);
      const migrated = await orders.findOne(order.id).exec();
      expect(migrated?.toJSON()).toStrictEqual(order);
      expect(migrated?.toJSON(true)._meta).toEqual(original._meta);
      await migrated!.incrementalPatch({ storeSettlement: done });
      await db.close();
      db = await createRxDatabase({ name, storage, multiInstance: false });
      orders = await addPosOrderCollection(db);
      expect((await orders.findOne(order.id).exec())?.toJSON()).toStrictEqual({ ...order, storeSettlement: done });
    } finally { await db.remove(); }
  });

  it('refuses a settlement with a field the schema does not name', async () => {
    const db = await createRxDatabase({ name: `possettle${uuidv7().replaceAll('-', '')}`, storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    try {
      const orders = await addPosOrderCollection(db);
      const order = refused({ storeSettlement: { ...settlement('done'), extra: 1 } as PosOrderStoreSettlement });
      await expect(orders.insert(order)).rejects.toThrow();
    } finally { await db.remove(); }
  });
});

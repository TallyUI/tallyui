// @vitest-environment node
// `pos_orders` holds sales not yet sent, so its version 0 to 1 bump (ADR-032, `sessionId`) must
// never lose one. Replaces WCPOS's `closure-migration.test.ts` (its closures v0 to v1 migration).
import { describe, expect, it } from 'vitest';
import { createRxDatabase, fillWithDefaultSettings, type RxCollectionCreator, type RxStorage } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { createOrderBuilder } from '../order/order-builder';
import { finalizeOrder } from './finalize';
import { addPosOrderCollectionTests, versionZero } from './open.test-helper';
import { posOrderCollection, posOrderSchema } from './schema';
import type { PosOrder } from './types';
import { uuidv7 } from './uuidv7';

/** A sale the outbox has tried and will try again: pending, with lines, split payments and its last error. */
function pendingOrder(): PosOrder {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 190000, pricesIncludeTax: false } });
  builder.addLine({ productId: 'p1', variantId: 'v1', name: 'Item 1', sku: 'SKU1', unitPrice: { amount: 850, currency: 'EUR' }, quantity: 2,
    taxRates: [{ code: 'VAT', ratePpm: 190000 }] });
  builder.addLine({ productId: 'p2', name: 'Item 2', unitPrice: { amount: 1200, currency: 'EUR' } });
  builder.addPayment({ method: 'external', amountMinor: 1000, reference: 'terminal' });
  builder.addPayment({ method: 'cash', amountMinor: 3000 });
  builder.setCustomer({ id: 'c1', name: 'Customer', email: 'buyer@example.com' });
  builder.setNote('Sale note');
  const order = finalizeOrder(builder.getSnapshot(), { registerId: 'r1', cashierRef: 'staff1' });
  return { ...order, lines: [{ ...order.lines[0], taxInclusive: true }, order.lines[1]],
    warnings: [{ code: 'total_mismatch', expectedMinor: 3451, serverMinor: 3452 }],
    error: { code: 'network', message: 'fetch failed' } };
}

async function open(name: string, storage: RxStorage<any, any>, collection: RxCollectionCreator) {
  const db = await createRxDatabase({ name, storage, multiInstance: false });
  return { db, added: db.addCollections({ pos_orders: collection }) };
}

/** Writes `order` into a new database's version-0 `pos_orders`, and returns the database's name. */
async function seed(storage: RxStorage<any, any>, order: PosOrder) {
  const name = `posmigrate${uuidv7().replaceAll('-', '')}`;
  const before = await open(name, storage, { schema: versionZero() });
  await (await before.added).pos_orders.insert(order);
  await before.db.close();
  return name;
}

/** Reads `id` straight from the version-0 storage, beneath RxDB's collection. */
async function versionZeroDocument(storage: RxStorage<any, any>, databaseName: string, id: string) {
  const raw = await storage.createStorageInstance<PosOrder>({ databaseName, collectionName: 'pos_orders',
    schema: fillWithDefaultSettings(versionZero()), options: {}, multiInstance: false, devMode: false, databaseInstanceToken: 'check' });
  const [doc] = await raw.findDocumentsById([id], false);
  await raw.close();
  return doc;
}

it('keeps a pending, unsynced version-0 order byte for byte through the migration to version 1', async () => {
  const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
  const order = pendingOrder();
  const original = structuredClone(order);
  const name = await seed(storage, order);
  const stored = await versionZeroDocument(storage, name, order.id);

  const after = await open(name, storage, posOrderCollection());
  const { pos_orders: v1 } = await after.added;
  try {
    const migrated = await v1.findOne(order.id).exec();
    expect(migrated?.toJSON()).toStrictEqual(original);
    expect(migrated?.toJSON()).not.toHaveProperty('sessionId');
    // Its storage metadata (the last-write time) is kept too.
    expect(migrated?.toJSON(true)._meta).toEqual(stored._meta);
    // The outbox's own query still finds it, oldest first.
    const pending = await v1.find({ selector: { syncStatus: 'pending' }, sort: [{ createdAt: 'asc' }] }).exec();
    expect(pending.map((doc) => doc.id)).toEqual([order.id]);
    // And version 1 takes the new field.
    await migrated!.incrementalPatch({ sessionId: 'session-1' });
    expect((await v1.findOne(order.id).exec())?.toJSON()).toStrictEqual({ ...original, sessionId: 'session-1' });
  } finally {
    await after.db.remove();
  }
});

it('refuses version 1 without its migration strategies, and keeps the order', async () => {
  const storage = getRxStorageMemory();
  const order = pendingOrder();
  // posOrderCollection() has loaded the migration plugin (as connectorCollection would have), so
  // RxDB starts migrating and then finds no strategy for version 1.
  posOrderCollection();
  const name = await seed(storage, order);
  const bare = await open(name, storage, { schema: posOrderSchema });
  await expect(bare.added).rejects.toMatchObject({ code: 'DM4' });
  await bare.db.close();
  expect(await versionZeroDocument(storage, name, order.id)).toMatchObject(order);
});

it('never drops a version-0 order that fails validation at version 1: a validating storage stops with DM4 and keeps it, an unvalidated one copies it as is', async () => {
  const memory = getRxStorageMemory();
  // Production opens without a validator (`createTallyDatabase` validates only in dev mode),
  // so a document can reach storage that no schema would accept.
  const invalid = { ...pendingOrder(), syncStatus: 'queued' } as unknown as PosOrder;

  // 1. Dev mode's validating storage refuses to write it at version 1 (a 422 inside the
  // migration's write, which RxDB raises as SNH "non conflict error"), and the migration stops.
  const refused = await seed(memory, invalid);
  const validating = await open(refused, wrappedValidateAjvStorage({ storage: memory }), posOrderCollection());
  const error = await validating.added.catch((e: unknown) => e);
  expect(error).toMatchObject({ code: 'DM4' });
  expect(JSON.stringify(error)).toContain('/syncStatus');
  await validating.db.close();
  // The order is still in the version-0 storage, untouched, for the next open to migrate.
  expect(await versionZeroDocument(memory, refused, invalid.id)).toMatchObject(invalid);

  // 2. Without a validator the same migration copies it unchanged.
  const unvalidated = await open(await seed(memory, invalid), memory, posOrderCollection());
  const { pos_orders: v1 } = await unvalidated.added;
  try {
    expect((await v1.findOne(invalid.id).exec())?.toJSON()).toStrictEqual(invalid);
  } finally {
    await unvalidated.db.remove();
  }
});

describe('addPosOrderCollection on memory storage', () => addPosOrderCollectionTests(() => getRxStorageMemory()));

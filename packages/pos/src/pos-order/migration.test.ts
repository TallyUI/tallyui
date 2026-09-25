// @vitest-environment node
// `pos_orders` holds sales not yet sent, so its version 0 to 1 bump (ADR-032, `sessionId`) and its
// version 2 bump (`lateSessionId`, ADR-065's `display` and `taxByRate`) must never lose one. Each
// test runs from version 0 and again from version 1. Replaces WCPOS's `closure-migration.test.ts`
// (its closures v0 to v1 migration).
import { describe, expect, it, vi } from 'vitest';
import { createRxDatabase, fillWithDefaultSettings, type RxCollectionCreator, type RxStorage } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { createOrderBuilder } from '../order/order-builder';
import { finalizeOrder } from './finalize';
import { addPosOrderCollection, POS_ORDER_MIGRATION_CLOSE_WAIT_MS } from './open';
import { addPosOrderCollectionTests, olderCollection, type Origin } from './open.test-helper';
import { posOrderCollection, posOrderSchema } from './schema';
import type { PosOrder } from './types';
import { uuidv7 } from './uuidv7';

/** A sale the outbox has tried and will try again: pending, with lines, split payments and its last error. A version-1 one has its session. */
function pendingOrder(from: Origin = 0): PosOrder {
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
    error: { code: 'network', message: 'fetch failed' }, ...(from === 1 ? { sessionId: 'session-1' } : {}) };
}

async function open(name: string, storage: RxStorage<any, any>, collection: RxCollectionCreator) {
  const db = await createRxDatabase({ name, storage, multiInstance: false });
  return { db, added: db.addCollections({ pos_orders: collection }) };
}

/** Writes `order` into a new database's `pos_orders` at version `from`, and returns the database's name. */
async function seed(storage: RxStorage<any, any>, order: PosOrder, from: Origin) {
  const name = `posmigrate${uuidv7().replaceAll('-', '')}`;
  const before = await open(name, storage, olderCollection(from));
  await (await before.added).pos_orders.insert(order);
  await before.db.close();
  return name;
}

/** Reads `id` straight from the version-`from` storage, beneath RxDB's collection. */
async function olderDocument(storage: RxStorage<any, any>, databaseName: string, id: string, from: Origin) {
  const raw = await storage.createStorageInstance<PosOrder>({ databaseName, collectionName: 'pos_orders',
    schema: fillWithDefaultSettings(olderCollection(from).schema), options: {}, multiInstance: false, devMode: false, databaseInstanceToken: 'check' });
  const [doc] = await raw.findDocumentsById([id], false);
  await raw.close();
  return doc;
}

async function keepsPendingOrder(from: Origin) {
  const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
  const order = pendingOrder(from);
  const original = structuredClone(order);
  const name = await seed(storage, order, from);
  const stored = await olderDocument(storage, name, order.id, from);

  const after = await open(name, storage, posOrderCollection());
  const { pos_orders: v1 } = await after.added;
  try {
    const migrated = await v1.findOne(order.id).exec();
    expect(migrated?.toJSON()).toStrictEqual(original);
    expect(migrated?.toJSON()).not.toHaveProperty(from === 0 ? 'sessionId' : 'lateSessionId');
    // Its storage metadata (the last-write time) is kept too.
    expect(migrated?.toJSON(true)._meta).toEqual(stored._meta);
    // The outbox's own query still finds it, oldest first.
    const pending = await v1.find({ selector: { syncStatus: 'pending' }, sort: [{ createdAt: 'asc' }] }).exec();
    expect(pending.map((doc) => doc.id)).toEqual([order.id]);
    // And the current version takes the new field.
    const added = from === 0 ? { sessionId: 'session-1' } : { lateSessionId: 'session-2' };
    await migrated!.incrementalPatch(added);
    expect((await v1.findOne(order.id).exec())?.toJSON()).toStrictEqual({ ...original, ...added });
  } finally {
    await after.db.remove();
  }
}

async function refusedWithoutStrategies(from: Origin) {
  const storage = getRxStorageMemory();
  const order = pendingOrder(from);
  // posOrderCollection() has loaded the migration plugin (as connectorCollection would have), so
  // RxDB starts migrating and then finds no strategy for the next version.
  posOrderCollection();
  const name = await seed(storage, order, from);
  const bare = await open(name, storage, { schema: posOrderSchema });
  await expect(bare.added).rejects.toMatchObject({ code: 'DM4' });
  await bare.db.close();
  expect(await olderDocument(storage, name, order.id, from)).toMatchObject(order);
}

async function neverDropsInvalidOrder(from: Origin) {
  const memory = getRxStorageMemory();
  // Production opens without a validator (`createTallyDatabase` validates only in dev mode),
  // so a document can reach storage that no schema would accept.
  const invalid = { ...pendingOrder(from), syncStatus: 'queued' } as unknown as PosOrder;

  // 1. Dev mode's validating storage refuses to write it at version 2 (a 422 inside the
  // migration's write, which RxDB raises as SNH "non conflict error"), and the migration stops.
  const refused = await seed(memory, invalid, from);
  const validating = await open(refused, wrappedValidateAjvStorage({ storage: memory }), posOrderCollection());
  const error = await validating.added.catch((e: unknown) => e);
  expect(error).toMatchObject({ code: 'DM4' });
  expect(JSON.stringify(error)).toContain('/syncStatus');
  await validating.db.close();
  // The order is still in the older version's storage, untouched, for the next open to migrate.
  expect(await olderDocument(memory, refused, invalid.id, from)).toMatchObject(invalid);

  // 2. Without a validator the same migration copies it unchanged.
  const unvalidated = await open(await seed(memory, invalid, from), memory, posOrderCollection());
  const { pos_orders: v1 } = await unvalidated.added;
  try {
    expect((await v1.findOne(invalid.id).exec())?.toJSON()).toStrictEqual(invalid);
  } finally {
    await unvalidated.db.remove();
  }
}

it('keeps a pending, unsynced version-0 order byte for byte through the migration to version 2', () => keepsPendingOrder(0));

it('refuses version 2 without its migration strategies, and keeps the order', () => refusedWithoutStrategies(0));

it('never drops a version-0 order that fails validation at version 2: a validating storage stops with DM4 and keeps it, an unvalidated one copies it as is',
  () => neverDropsInvalidOrder(0));

describe('addPosOrderCollection on memory storage', () => addPosOrderCollectionTests(() => getRxStorageMemory()));

/** `storage`, but every write to `pos_orders` never settles: like a stuck migration batch. */
function stuckWrites(storage: RxStorage<any, any>): RxStorage<any, any> {
  return { ...storage, createStorageInstance: async (params) => {
    const instance = await storage.createStorageInstance(params);
    if (params.collectionName !== 'pos_orders') return instance;
    return new Proxy(instance, { get: (target: any, key) => key === 'bulkWrite'
      ? () => new Promise(() => undefined)
      : typeof target[key] === 'function' ? target[key].bind(target) : target[key] });
  } };
}

async function closesWithinWaitLimit(from: Origin) {
  const memory = getRxStorageMemory();
  const good = pendingOrder(from);
  const name = `posopen${uuidv7().replaceAll('-', '')}`;
  const before = await open(name, memory, olderCollection(from));
  await (await before.added).pos_orders.insert(good);
  await before.db.close();

  const db = await createRxDatabase({ name, storage: stuckWrites(memory), multiInstance: false });
  addPosOrderCollection(db).catch(() => undefined);
  // Real, short wait for the call above to reach the stuck write, before faking the clock.
  await new Promise((resolve) => setTimeout(resolve, 50));

  vi.useFakeTimers();
  try {
    const closing = db.close();
    await vi.advanceTimersByTimeAsync(POS_ORDER_MIGRATION_CLOSE_WAIT_MS + 1000);
    await expect(closing).resolves.toBe(true);
  } finally {
    vi.useRealTimers();
  }
  // The order was never touched by the stuck run: it is still in the older version's storage for the next open.
  expect(await olderDocument(memory, name, good.id, from)).toMatchObject(good);
}

it('closes within the close-wait limit even when a migration never settles, and never loses the order', () => closesWithinWaitLimit(0));

async function refusesMultiInstance(from?: Origin) {
  const memory = getRxStorageMemory();
  // From version 1 a version-1 order waits in its storage, and stays there; the version-0 run keeps its empty database.
  const order = pendingOrder(from);
  const name = from === undefined ? `posopen${uuidv7().replaceAll('-', '')}` : await seed(memory, order, from);
  const db = await createRxDatabase({ name, storage: memory, multiInstance: true });
  try {
    await expect(addPosOrderCollection(db)).rejects.toThrow('addPosOrderCollection: multiInstance databases are not supported (ADR-061)');
    expect(db.collections.pos_orders).toBeUndefined();
  } finally {
    await db.close();
  }
  if (from !== undefined) expect(await olderDocument(memory, name, order.id, from)).toMatchObject(order);
}

it('refuses a multiInstance database before any reset, and adds no collection', () => refusesMultiInstance());

async function oneOnCloseHandler(from: Origin) {
  const memory = getRxStorageMemory();
  const bad = { ...pendingOrder(from), syncStatus: 'queued' } as unknown as PosOrder;
  const name = `posopen${uuidv7().replaceAll('-', '')}`;
  const before = await open(name, memory, olderCollection(from));
  await (await before.added).pos_orders.insert(bad);
  await before.db.close();

  // RxDB's own migration-state plumbing registers its own db.onClose handler per attempt too
  // (unrelated to this function), so only entries this function itself pushed are counted.
  const ours = (target: { onClose: Array<() => unknown> }) =>
    target.onClose.filter((handler) => handler.toString().includes('waitWithTimeout')).length;

  const db = await createRxDatabase({ name, storage: wrappedValidateAjvStorage({ storage: memory }), multiInstance: false });
  expect(ours(db)).toBe(0);
  for (let attempt = 0; attempt < 3; attempt++) {
    await expect(addPosOrderCollection(db)).rejects.toMatchObject({ code: 'DM4' });
  }
  // Still one, not three: this is the fix.
  expect(ours(db)).toBe(1);
  await db.close();

  // The same database, fixed: the earlier runs' replications no longer wake on this write.
  const fixing = await open(name, memory, olderCollection(from));
  await (await (await fixing.added).pos_orders.findOne(bad.id).exec())!.incrementalPatch({ syncStatus: 'pending' });
  await fixing.db.close();

  const reopened = await createRxDatabase({ name, storage: wrappedValidateAjvStorage({ storage: memory }), multiInstance: false });
  expect(await (await addPosOrderCollection(reopened)).count().exec()).toBe(1);
  expect(ours(reopened)).toBe(1);
  await reopened.close();
}

it('keeps at most one db.onClose handler across DM4 retries, and the fixed reopen of the same database gets its own one', () => oneOnCloseHandler(0));

// The same set from version 1 to 2 (registers c1a): a version-1 order carries its `sessionId`, and keeps it.
describe('from version 1', () => {
  it('keeps a pending, unsynced version-1 order, with its sessionId, byte for byte through the migration to version 2', () => keepsPendingOrder(1));
  it('refuses version 2 without its migration strategies, and keeps the version-1 order', () => refusedWithoutStrategies(1));
  it('never drops a version-1 order that fails validation at version 2: a validating storage stops with DM4 and keeps it, an unvalidated one copies it as is',
    () => neverDropsInvalidOrder(1));
  describe('addPosOrderCollection on memory storage', () => addPosOrderCollectionTests(() => getRxStorageMemory(), { from: 1 }));
  it('closes within the close-wait limit even when a migration never settles, and never loses the version-1 order', () => closesWithinWaitLimit(1));
  it('refuses a multiInstance database before any reset, adds no collection, and keeps the version-1 order', () => refusesMultiInstance(1));
  it('keeps at most one db.onClose handler across DM4 retries, and the fixed reopen of the same database gets its own one', () => oneOnCloseHandler(1));
});

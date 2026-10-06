// @vitest-environment node
// `pos_orders` holds sales not yet sent, so its version 0 to 1 bump (ADR-032, `sessionId`) and its
// version 2 bump (`lateSessionId`, ADR-065's `display` and `taxByRate`) must never lose one. Each
// test runs from versions 0, 1, 2 and 3 to the current version. Replaces WCPOS's `closure-migration.test.ts`
// (its closures v0 to v1 migration).
import { describe, expect, it, vi } from 'vitest';
import { createRxDatabase, fillWithDefaultSettings, type RxCollectionCreator, type RxStorage } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { createOrderBuilder } from '../order/order-builder';
import { mintUuid } from '../register/register-document';
import { DEFAULT_TAX_ROUNDING } from '../tax/exact';
import { finalizeOrder } from './finalize';
import { addPosOrderCollection, POS_ORDER_MIGRATION_CLOSE_WAIT_MS, PosOrderOpenClosedError } from './open';
import { addPosOrderCollectionTests, olderCollection, type OlderPosOrder, type Origin } from './open.test-helper';
import { posOrderCollection, posOrderSchema } from './schema';
import type { PosOrder } from './types';
import { uuidv7 } from './uuidv7';

/**
 * A sale the outbox has tried and will try again: pending, with lines, split payments and its last error. A version-1 one has its
 * session; a version-2 one ADR-065's figures and both sessions; a version-3 one was also downgraded to order.create version 2.
 */
function pendingOrder(from: Origin = 0): OlderPosOrder {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 190000, pricesIncludeTax: false } });
  builder.addLine({ productId: 'p1', variantId: 'v1', name: 'Item 1', sku: 'SKU1', unitPrice: { amount: 850, currency: 'EUR' }, quantity: 2,
    taxRates: [{ code: 'VAT', ratePpm: 190000 }] });
  builder.addLine({ productId: 'p2', name: 'Item 2', unitPrice: { amount: 1200, currency: 'EUR' } });
  builder.addPayment({ method: 'external', amountMinor: 1000, reference: 'terminal' });
  builder.addPayment({ method: 'cash', amountMinor: 3000 });
  builder.setCustomer({ id: 'c1', name: 'Customer', email: 'buyer@example.com' });
  builder.setNote('Sale note');
  // No older till recorded its tax rounding.
  const { taxRounding: _rounding, saleId: _saleId, ...order } = finalizeOrder(builder.getSnapshot(), { registerId: 'r1', cashierRef: 'staff1',
    ...(from >= 2 ? { capabilities: { orderCreate: 3 } } : {}) });
  return { ...order, lines: [{ ...order.lines[0], taxInclusive: true }, order.lines[1]],
    warnings: [{ code: 'total_mismatch', expectedMinor: 3451, serverMinor: 3452 }],
    error: { code: 'network', message: 'fetch failed' }, ...(from === 1 ? { sessionId: 'session-1' } : {}),
    ...(from >= 2 ? { sessionId: mintUuid(), lateSessionId: mintUuid() } : {}),
    ...(from === 3 ? { sentVersion: 2, downgradedFrom: 3 } : {}) };
}

async function open(name: string, storage: RxStorage<any, any>, collection: RxCollectionCreator) {
  const db = await createRxDatabase({ name, storage, multiInstance: false });
  return { db, added: db.addCollections({ pos_orders: collection }) };
}

/** Writes `order` into a new database's `pos_orders` at version `from`, and returns the database's name. */
async function seed(storage: RxStorage<any, any>, order: OlderPosOrder, from: Origin) {
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
  // Version 5 records the version it was sent at: with no figures and no discount, 1. Version 6 the default rounding.
  const original = { ...structuredClone(order), sentVersion: 1 as const, taxRounding: DEFAULT_TAX_ROUNDING };
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

  // 1. Dev mode's validating storage refuses to write it at the current version (a 422 inside the
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
    expect((await v1.findOne(invalid.id).exec())?.toJSON()).toStrictEqual({ ...invalid, sentVersion: from === 3 ? 2 : from === 2 ? 3 : 1,
      taxRounding: DEFAULT_TAX_ROUNDING });
  } finally {
    await unvalidated.db.remove();
  }
}

it('keeps a pending, unsynced version-0 order byte for byte through the migration to the current version', () => keepsPendingOrder(0));

describe('from version 6', () => {
  it('keeps a pending order with taxRounding and without saleId unchanged through the migration to version 7', async () => {
    const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
    const order: PosOrder = { ...pendingOrder(3), taxRounding: { granularity: 'per_line_items', mode: 'half_up' } };
    const original = structuredClone(order);
    expect(order.syncStatus).toBe('pending');
    expect(order).not.toHaveProperty('saleId');
    const { saleId: _saleId, ...v6Properties } = structuredClone(posOrderSchema).properties;
    const schema = { ...structuredClone(posOrderSchema), version: 6, properties: v6Properties };
    const { 7: _v7, ...migrationStrategies } = posOrderCollection().migrationStrategies;
    const name = `posmigrate${uuidv7().replaceAll('-', '')}`;
    const before = await open(name, storage, { schema, migrationStrategies });
    await (await before.added).pos_orders.insert(order);
    await before.db.close();
    const after = await open(name, storage, posOrderCollection());
    try {
      const { pos_orders } = await after.added;
      expect(pos_orders.schema.version).toBe(7);
      expect((await pos_orders.findOne(order.id).exec())?.toJSON()).toStrictEqual(original);
    } finally {
      await after.db.remove();
    }
  });
});

it('refuses the current version without its migration strategies, and keeps the order', () => refusedWithoutStrategies(0));

it('never drops a version-0 order that fails validation at the current version: a validating storage stops with DM4 and keeps it, an unvalidated one copies it as is',
  () => neverDropsInvalidOrder(0));

describe('addPosOrderCollection on memory storage', () => addPosOrderCollectionTests(() => getRxStorageMemory()));

describe('addPosOrderCollection accepts a same-tick insert on memory storage', () => {
  it('accepts a pending order immediately after opening a fresh database', async () => {
    const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
    const order = { ...pendingOrder(2), taxRounding: DEFAULT_TAX_ROUNDING };
    const db = await createRxDatabase({ name: `posinsert${uuidv7().replaceAll('-', '')}`, storage, multiInstance: false });
    try {
      const collection = await addPosOrderCollection(db);
      const inserted = collection.insert(order);
      await expect(inserted).resolves.toMatchObject({ id: order.id, syncStatus: 'pending' });
      expect((await collection.findOne(order.id).exec())?.toJSON()).toStrictEqual(order);
    } finally {
      await db.close();
    }
  });

  it('accepts a pending order immediately after migrating a version-2 database', async () => {
    const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
    const name = await seed(storage, pendingOrder(2), 2);
    const order = { ...pendingOrder(2), taxRounding: DEFAULT_TAX_ROUNDING };
    const db = await createRxDatabase({ name, storage, multiInstance: false });
    try {
      const collection = await addPosOrderCollection(db);
      const inserted = collection.insert(order);
      await expect(inserted).resolves.toMatchObject({ id: order.id, syncStatus: 'pending' });
      expect((await collection.findOne(order.id).exec())?.toJSON()).toStrictEqual(order);
    } finally {
      await db.close();
    }
  });
});

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

/** The backstop: an open on a database whose close has begun rejects with the coded error, and writes nothing. */
async function refusesClosingDatabase(from: Origin) {
  const memory = getRxStorageMemory();
  const order = pendingOrder(from);
  const name = await seed(memory, order, from);
  const db = await createRxDatabase({ name, storage: memory, multiInstance: false });
  const closing = db.close();
  const error = await addPosOrderCollection(db).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(PosOrderOpenClosedError);
  expect(error).toMatchObject({ code: 'POS_ORDER_OPEN_CLOSED' });
  await closing;
  expect(db.collections.pos_orders).toBeUndefined();
  expect(await olderDocument(memory, name, order.id, from)).toMatchObject(order);
}

it('an open on a database whose close has begun rejects with the coded error and keeps the order', () => refusesClosingDatabase(0));

/**
 * The backstop: the open is held before it removes the migration checkpoint for longer than a close
 * waits. Once it resumes, it stops with the coded error before any write, and the next open migrates the order.
 */
async function stopsOnceCloseGivesUp(from: Origin) {
  const memory = getRxStorageMemory();
  const order = pendingOrder(from);
  const name = await seed(memory, order, from);
  let release!: () => void;
  let reached!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const paused = new Promise<void>((resolve) => { reached = resolve; });
  const holding: RxStorage<any, any> = { ...memory, createStorageInstance: async (params) => {
    if (params.collectionName.startsWith('rx-migration-state-meta-')) { reached(); await held; }
    return memory.createStorageInstance(params);
  } };
  const db = await createRxDatabase({ name, storage: holding, multiInstance: false });
  const opening = addPosOrderCollection(db).catch((e: unknown) => e);
  await paused;

  vi.useFakeTimers();
  try {
    const closing = db.close();
    await vi.advanceTimersByTimeAsync(POS_ORDER_MIGRATION_CLOSE_WAIT_MS + 1000);
    await expect(closing).resolves.toBe(true);
  } finally {
    vi.useRealTimers();
  }
  release();
  const error = await opening;
  expect(error).toBeInstanceOf(PosOrderOpenClosedError);
  expect(error).toMatchObject({ code: 'POS_ORDER_OPEN_CLOSED' });
  expect(await olderDocument(memory, name, order.id, from)).toMatchObject(order);

  const next = await createRxDatabase({ name, storage: memory, multiInstance: false });
  expect((await (await addPosOrderCollection(next)).findOne(order.id).exec())?.toJSON())
    .toStrictEqual({ ...order, sentVersion: order.sentVersion ?? (from === 2 ? 3 : 1), taxRounding: DEFAULT_TAX_ROUNDING });
  await next.close();
}

it('an open held past the close-wait limit stops with the coded error before any write, and the next open migrates the order',
  () => stopsOnceCloseGivesUp(0));

// The same set from version 1 to the current version: a version-1 order carries its `sessionId`, and keeps it.
describe('from version 1', () => {
  it('keeps a pending, unsynced version-1 order, with its sessionId, byte for byte through the migration to the current version', () => keepsPendingOrder(1));
  it('refuses the current version without its migration strategies, and keeps the version-1 order', () => refusedWithoutStrategies(1));
  it('never drops a version-1 order that fails validation at the current version: a validating storage stops with DM4 and keeps it, an unvalidated one copies it as is',
    () => neverDropsInvalidOrder(1));
  describe('addPosOrderCollection on memory storage', () => addPosOrderCollectionTests(() => getRxStorageMemory(), { from: 1 }));
  it('closes within the close-wait limit even when a migration never settles, and never loses the version-1 order', () => closesWithinWaitLimit(1));
  it('refuses a multiInstance database before any reset, adds no collection, and keeps the version-1 order', () => refusesMultiInstance(1));
  it('keeps at most one db.onClose handler across DM4 retries, and the fixed reopen of the same database gets its own one', () => oneOnCloseHandler(1));
  it('an open on a database whose close has begun rejects with the coded error and keeps the version-1 order', () => refusesClosingDatabase(1));
  it('an open held past the close-wait limit stops with the coded error before any write, and the next open migrates the version-1 order',
    () => stopsOnceCloseGivesUp(1));
});

describe('from version 2', () => {
  it('keeps a pending, unsynced version-2 order with sessionId, lateSessionId, display and taxByRate byte for byte through the migration to the current version', async () => {
    const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
    const order = pendingOrder(2);
    const original = { ...structuredClone(order), sentVersion: 3, taxRounding: DEFAULT_TAX_ROUNDING };
    expect(order.sessionId).toHaveLength(36);
    expect(order.lateSessionId).toHaveLength(36);
    expect(order.display).toBeDefined();
    expect(order.taxByRate).toBeDefined();
    const name = await seed(storage, order, 2);
    const stored = await olderDocument(storage, name, order.id, 2);
    const after = await open(name, storage, posOrderCollection());
    try {
      const { pos_orders } = await after.added;
      const migrated = await pos_orders.findOne(order.id).exec();
      expect(migrated?.toJSON()).toStrictEqual(original);
      expect(migrated?.toJSON(true)._meta).toEqual(stored._meta);
      const pending = await pos_orders.find({ selector: { syncStatus: 'pending' }, sort: [{ createdAt: 'asc' }] }).exec();
      expect(pending.map((doc) => doc.id)).toEqual([order.id]);
    } finally {
      await after.db.close();
    }
  });
  it('refuses the current version without its migration strategies, and keeps the version-2 order', () => refusedWithoutStrategies(2));
  it('never drops a version-2 order that fails validation at the current version: a validating storage stops with DM4 and keeps it, an unvalidated one copies it as is',
    () => neverDropsInvalidOrder(2));
  it('never drops a version-2 order whose sessionId is longer than 36 characters: a validating storage stops with DM4 and keeps it', async () => {
    const memory = getRxStorageMemory();
    const order = { ...pendingOrder(2), sessionId: 's'.repeat(37) };
    const storage = wrappedValidateAjvStorage({ storage: memory });
    const name = await seed(storage, order, 2);
    const before = await olderDocument(storage, name, order.id, 2);
    const after = await open(name, storage, posOrderCollection());
    const error = await after.added.catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'DM4' });
    expect(JSON.stringify(error)).toContain('/sessionId');
    await after.db.close();
    expect(await olderDocument(storage, name, order.id, 2)).toStrictEqual(before);
  });
  describe('addPosOrderCollection on memory storage', () => addPosOrderCollectionTests(() => getRxStorageMemory(), { from: 2 }));
  it('closes within the close-wait limit even when a migration never settles, and never loses the version-2 order', () => closesWithinWaitLimit(2));
  it('refuses a multiInstance database before any reset, adds no collection, and keeps the version-2 order', () => refusesMultiInstance(2));
  it('keeps at most one db.onClose handler across DM4 retries, and the fixed reopen of the same database gets its own one', () => oneOnCloseHandler(2));
  it('an open on a database whose close has begun rejects with the coded error and keeps the version-2 order', () => refusesClosingDatabase(2));
  it('an open held past the close-wait limit stops with the coded error before any write, and the next open migrates the version-2 order',
    () => stopsOnceCloseGivesUp(2));
});

// Version 3 is what every tester on main holds. `sentVersion` and `downgradedFrom` are the outbox's version fallback:
// an order that lost them would be re-sent at a higher order.create version than the store may already have applied.
describe('from version 3', () => {
  it('keeps a pending, unsynced version-3 order with every optional field set byte for byte through the migration to the current version', async () => {
    const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
    const order: OlderPosOrder = { ...pendingOrder(3), serverRefs: { orderId: 'server-1', displayId: '#1001', totalMinor: 3451 } };
    const original = { ...structuredClone(order), taxRounding: DEFAULT_TAX_ROUNDING };
    const optional = ['note', 'registerId', 'sessionId', 'cashierRef', 'serverRefs', 'warnings', 'error', 'lateSessionId', 'sentVersion',
      'downgradedFrom', 'display', 'taxByRate'];
    for (const key of optional) expect(order, key).toHaveProperty(key);
    expect(order).toMatchObject({ sentVersion: 2, downgradedFrom: 3, customer: { id: 'c1', name: 'Customer', email: 'buyer@example.com' } });
    expect(order.payments.map((payment) => Object.keys(payment).sort())).toEqual([
      ['amountMinor', 'id', 'method', 'reference'], ['amountMinor', 'changeMinor', 'id', 'method', 'tenderedMinor']]);
    const name = await seed(storage, order, 3);
    const stored = await olderDocument(storage, name, order.id, 3);
    const after = await open(name, storage, posOrderCollection());
    try {
      const { pos_orders } = await after.added;
      const migrated = await pos_orders.findOne(order.id).exec();
      expect(migrated?.toJSON()).toStrictEqual(original);
      expect(migrated?.toJSON()).not.toHaveProperty('localWarnings');
      expect(migrated?.toJSON()).not.toHaveProperty('serverFailures');
      expect(migrated?.toJSON(true)._meta).toEqual(stored._meta);
      const pending = await pos_orders.find({ selector: { syncStatus: 'pending' }, sort: [{ createdAt: 'asc' }] }).exec();
      expect(pending.map((doc) => doc.id)).toEqual([order.id]);
    } finally {
      await after.db.close();
    }
  });
  it('refuses the current version without its migration strategies, and keeps the version-3 order', () => refusedWithoutStrategies(3));
  it('never drops a version-3 order that fails validation at the current version: a validating storage stops with DM4 and keeps it, an unvalidated one copies it as is',
    () => neverDropsInvalidOrder(3));
  describe('addPosOrderCollection on memory storage', () => addPosOrderCollectionTests(() => getRxStorageMemory(), { from: 3 }));
  it('closes within the close-wait limit even when a migration never settles, and never loses the version-3 order', () => closesWithinWaitLimit(3));
  it('refuses a multiInstance database before any reset, adds no collection, and keeps the version-3 order', () => refusesMultiInstance(3));
  it('keeps at most one db.onClose handler across DM4 retries, and the fixed reopen of the same database gets its own one', () => oneOnCloseHandler(3));
  it('an open on a database whose close has begun rejects with the coded error and keeps the version-3 order', () => refusesClosingDatabase(3));
  it('an open held past the close-wait limit stops with the coded error before any write, and the next open migrates the version-3 order',
    () => stopsOnceCloseGivesUp(3));
});

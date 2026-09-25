// `addPosOrderCollection`'s tests, run on memory storage (`migration.test.ts`) and on SQLite
// (`@tallyui/integration-tests`). Every step reads the orders in both versions' storage.
import { expect, it } from 'vitest';
import {
  createRxDatabase, fillWithDefaultSettings, getPrimaryKeyOfInternalDocument, getSingleDocument, INTERNAL_CONTEXT_MIGRATION_STATUS,
  normalizeMangoQuery, prepareQuery, type RxDatabase, type RxJsonSchema, type RxStorage,
} from 'rxdb';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { addPosOrderCollection } from './open';
import { posOrderSchema } from './schema';
import type { PosOrder } from './types';
import { uuidv7 } from './uuidv7';

/** The shipped version-0 schema: version 1 with its only addition, `sessionId`, taken out. */
export function versionZero(): RxJsonSchema<PosOrder> {
  const schema = structuredClone(posOrderSchema);
  delete (schema.properties as Record<string, unknown>).sessionId;
  return { ...schema, version: 0 };
}

/** A pending sale; `syncStatus: 'queued'` makes one no version-1 validator accepts. */
function order(n: number, syncStatus = 'pending'): PosOrder {
  const at = new Date(Date.UTC(2026, 8, 25, 0, 0, n)).toISOString();
  return {
    id: `order-${String(n).padStart(4, '0')}`, commandId: `command-${n}`, createdAt: at, updatedAt: at, currency: 'EUR',
    pricesIncludeTax: false, subtotalMinor: 100 * n, discountMinor: 0, taxMinor: 0, totalMinor: 100 * n,
    syncStatus: syncStatus as PosOrder['syncStatus'], customer: null, lines: [], payments: [{ id: `payment-${n}`, method: 'cash', amountMinor: 100 * n }],
  };
}

const STATUS_ID = getPrimaryKeyOfInternalDocument('pos_orders-v-1', INTERNAL_CONTEXT_MIGRATION_STATUS);
const status = async (db: RxDatabase) => (await getSingleDocument(db.internalStore, STATUS_ID))?.data;

/** One database on `storage` (never validated) and `validating` (dev mode's ajv over the same storage), each opened through `wrap`. */
function store(storage: RxStorage<any, any>, wrap = (opened: RxStorage<any, any>) => opened) {
  const name = `posopen${uuidv7().replaceAll('-', '')}`;
  const validating = wrappedValidateAjvStorage({ storage });
  const open = (validated = true) => createRxDatabase({ name, storage: wrap(validated ? validating : storage), multiInstance: false });
  /** The version-0 app: opens `pos_orders` at version 0, runs `step` on it, and closes. */
  const versionZeroApp = async (step: (orders: any) => Promise<unknown>) => {
    const db = await open(false);
    await step((await db.addCollections({ pos_orders: { schema: versionZero() } })).pos_orders);
    await db.close();
  };
  /** Every order in each version's storage, read beneath RxDB, without its storage metadata, oldest first. */
  const stored = async () => {
    const [v0, v1] = await Promise.all([versionZero(), posOrderSchema].map(async (schema) => {
      const raw = await storage.createStorageInstance<PosOrder>({ databaseName: name, collectionName: 'pos_orders',
        schema: fillWithDefaultSettings(schema), options: {}, multiInstance: false, devMode: false, databaseInstanceToken: 'check' });
      const query = normalizeMangoQuery(raw.schema, { selector: {}, sort: [{ id: 'asc' }] });
      const { documents } = await raw.query(prepareQuery(raw.schema, query));
      await raw.close();
      return documents.map(({ _rev, _meta, _attachments, _deleted, ...doc }) => doc);
    }));
    return { v0, v1, ids: { v0: v0.map((doc) => doc.id), v1: v1.map((doc) => doc.id) } };
  };
  return { open, versionZeroApp, stored };
}

/**
 * `storage` with a 10ms wait before each write to `pos_orders`, like a SQLite worker's round trip:
 * a close finds the database idle mid-migration, and the migration's batches queue up.
 */
function slow(storage: RxStorage<any, any>): RxStorage<any, any> {
  return { ...storage, createStorageInstance: async (params) => {
    const instance = await storage.createStorageInstance(params);
    if (params.collectionName !== 'pos_orders') return instance;
    return new Proxy(instance, { get: (target: any, key) => key === 'bulkWrite'
      ? async (...args: any[]) => { await new Promise((resolve) => setTimeout(resolve, 10)); return target.bulkWrite(...args); }
      : typeof target[key] === 'function' ? target[key].bind(target) : target[key] });
  } };
}

/**
 * `sqlite` adds the interrupted-open test. On memory storage a failed run's migration, which RxDB
 * never cancels, wakes on the next write to the shared in-process state and writes into storage
 * RxDB has since removed; SQLite's closed instances stay quiet.
 */
export function addPosOrderCollectionTests(makeStorage: () => RxStorage<any, any>, { sqlite = false } = {}) {
  it('after a DM4, the fixed order migrates on the very next open, with every order byte for byte', async () => {
    const { open, versionZeroApp, stored } = store(makeStorage());
    const [good, bad] = [order(1), order(2, 'queued')];
    await versionZeroApp((orders) => orders.bulkInsert([good, bad]));
    expect((await stored()).ids).toEqual({ v0: [good.id, bad.id], v1: [] });

    const first = await open();
    await expect(addPosOrderCollection(first)).rejects.toMatchObject({ code: 'DM4' });
    await first.close();
    // The good order is copied, and both are still in version 0.
    expect((await stored()).ids).toEqual({ v0: [good.id, bad.id], v1: [good.id] });

    const fixed = { ...bad, syncStatus: 'pending' as const };
    await versionZeroApp(async (orders) => (await orders.findOne(bad.id).exec()).incrementalPatch({ syncStatus: 'pending' }));
    const next = await open();
    const pos = await addPosOrderCollection(next);
    expect((await pos.find().exec()).map((doc) => doc.toJSON())).toStrictEqual([good, fixed]);
    await next.close();
    expect(await stored()).toMatchObject({ v0: [], v1: [good, fixed] });
  });

  it.runIf(sqlite)('repeated opens closed mid-open or straight after they settle lose and duplicate nothing, and the fixed open migrates all', async () => {
    const { open, versionZeroApp, stored } = store(makeStorage(), slow);
    // Three migration batches (RxDB's 200); the invalid order is in the last.
    const orders = [...Array.from({ length: 450 }, (_, i) => order(i + 1)), order(451, 'queued')];
    const ids = orders.map((o) => o.id);
    await versionZeroApp((collection) => collection.bulkInsert(orders));
    /** Opens, closes after `wait` ms (mid-migration when short), and reads both storages. */
    const cycle = async (wait: number) => {
      const db = await open();
      const opening = addPosOrderCollection(db).then(() => 'resolved', (e) => e.code);
      await new Promise((resolve) => setTimeout(resolve, wait));
      await db.close();
      return { outcome: await opening, ...(await stored()).ids };
    };
    // Every valid order is copied, and every order stays in version 0 until all can move.
    for (const wait of [0, 10, 30, 500]) expect(await cycle(wait)).toEqual({ outcome: 'DM4', v0: ids, v1: ids.slice(0, 450) });

    await versionZeroApp(async (collection) => (await collection.findOne(ids[450]).exec()).incrementalPatch({ syncStatus: 'pending' }));
    for (const wait of [0, 10, 500]) expect(await cycle(wait)).toEqual({ outcome: 'resolved', v0: [], v1: ids });
    expect((await stored()).v1).toStrictEqual([...orders.slice(0, 450), { ...orders[450], syncStatus: 'pending' }]);
  }, 60000);

  it('after a rollback to the version-0 app, its new sales migrate before the reopen resolves', async () => {
    const { open, versionZeroApp, stored } = store(makeStorage());
    const [first, ...rolledBack] = [order(1), order(2), order(3)];
    await versionZeroApp((orders) => orders.insert(first));
    const upgraded = await open();
    await addPosOrderCollection(upgraded);
    expect(await status(upgraded)).toMatchObject({ status: 'DONE', count: { total: 1, handled: 1 } });
    await upgraded.close();
    expect((await stored()).ids).toEqual({ v0: [], v1: [first.id] });

    await versionZeroApp((orders) => orders.bulkInsert(rolledBack));
    expect((await stored()).ids).toEqual({ v0: rolledBack.map((o) => o.id), v1: [first.id] });

    const reupgraded = await open();
    const pos = await addPosOrderCollection(reupgraded);
    expect((await pos.find().exec()).map((doc) => doc.toJSON())).toStrictEqual([first, ...rolledBack]);
    // The status describes this run, not the one before the rollback.
    expect(await status(reupgraded)).toMatchObject({ status: 'DONE', count: { total: 2, handled: 2 } });
    await reupgraded.close();
    expect(await stored()).toMatchObject({ v0: [], v1: [first, ...rolledBack] });
  });

  it('a genuinely invalid order rejects with DM4 after the migration has stopped, and every order is kept', async () => {
    const { open, versionZeroApp, stored } = store(makeStorage());
    const [good, bad] = [order(1), order(2, 'queued')];
    await versionZeroApp((orders) => orders.bulkInsert([good, bad]));
    for (let attempt = 0; attempt < 2; attempt++) {
      const db = await open();
      const error = await addPosOrderCollection(db).catch((e: unknown) => e);
      expect(error).toMatchObject({ code: 'DM4' });
      expect(JSON.stringify(error)).toContain('/syncStatus');
      // Stopped: its last step, writing ERROR, is done, and the collection is closed for the next open.
      expect(await status(db)).toMatchObject({ status: 'ERROR' });
      expect(db.collections.pos_orders).toBeUndefined();
      await db.close();
      const { v0, v1 } = await stored();
      expect(v0).toStrictEqual([good, bad]);
      expect(v1).toStrictEqual([good]);
    }
  });

  it('opens a new database without migrating, and refuses a second pos_orders', async () => {
    const db = await store(makeStorage()).open();
    await (await addPosOrderCollection(db)).insert(order(1));
    expect(await status(db)).toBeUndefined();
    await expect(addPosOrderCollection(db)).rejects.toMatchObject({ code: 'DB3' });
    await db.close();
  });
}

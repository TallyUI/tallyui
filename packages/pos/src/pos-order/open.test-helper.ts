// `addPosOrderCollection`'s tests, run on memory storage (`migration.test.ts`) and on SQLite
// (`@tallyui/integration-tests`), from each older version. Every step reads the orders in both versions' storage.
import { expect, it } from 'vitest';
import {
  addRxPlugin, createRxDatabase, fillWithDefaultSettings, getPrimaryKeyOfInternalDocument, getSingleDocument, INTERNAL_CONTEXT_MIGRATION_STATUS,
  INTERNAL_STORAGE_NAME, normalizeMangoQuery, prepareQuery, type RxCollectionCreator, type RxDatabase, type RxJsonSchema, type RxStorage,
  type RxStorageInstanceCreationParams,
} from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { callbackSink, type LogEntry } from '../logging';
import { addPosOrderCollection, PosOrderOpenClosedError, posOrdersLogger } from './open';
import { posOrderSchema } from './schema';
import type { PosOrder } from './types';
import { uuidv7 } from './uuidv7';

/** The shipped version-1 schema: version 2 with its only additions, `lateSessionId`, `display` and `taxByRate`, taken out. */
export function versionOne(): RxJsonSchema<PosOrder> {
  const schema = structuredClone(posOrderSchema);
  for (const key of ['lateSessionId', 'display', 'taxByRate']) delete (schema.properties as Record<string, unknown>)[key];
  return { ...schema, version: 1 };
}

/** The shipped version-0 schema: version 1 with its only addition, `sessionId`, taken out. */
export function versionZero(): RxJsonSchema<PosOrder> {
  const schema = versionOne();
  delete (schema.properties as Record<string, unknown>).sessionId;
  return { ...schema, version: 0 };
}

/** A stored older `pos_orders` version, which `addPosOrderCollection` migrates to the current one. */
export type Origin = 0 | 1;

/** `pos_orders` as the shipped app at `from` added it: version 1 came with its identity strategy. */
export function olderCollection(from: Origin): RxCollectionCreator<PosOrder> {
  addRxPlugin(RxDBMigrationSchemaPlugin);
  return from === 0 ? { schema: versionZero() } : { schema: versionOne(), migrationStrategies: { 1: (doc: PosOrder) => doc } };
}

/** A pending sale; `syncStatus: 'queued'` makes one no version's validator accepts. */
function sale(n: number, syncStatus = 'pending'): PosOrder {
  const at = new Date(Date.UTC(2026, 8, 25, 0, 0, n)).toISOString();
  return {
    id: `order-${String(n).padStart(4, '0')}`, commandId: `command-${n}`, createdAt: at, updatedAt: at, currency: 'EUR',
    pricesIncludeTax: false, subtotalMinor: 100 * n, discountMinor: 0, taxMinor: 0, totalMinor: 100 * n,
    syncStatus: syncStatus as PosOrder['syncStatus'], customer: null, lines: [], payments: [{ id: `payment-${n}`, method: 'cash', amountMinor: 100 * n }],
  };
}

const STATUS_ID = getPrimaryKeyOfInternalDocument(`pos_orders-v-${posOrderSchema.version}`, INTERNAL_CONTEXT_MIGRATION_STATUS);
const status = async (db: RxDatabase) => (await getSingleDocument(db.internalStore, STATUS_ID))?.data;

/**
 * One database on `storage` (never validated) and `validating` (dev mode's ajv over the same storage), each opened through `wrap`.
 * `v0` in `stored()` is the storage of the older version `from`, and `v1` the current version's.
 */
function store(storage: RxStorage<any, any>, from: Origin, wrap = (opened: RxStorage<any, any>) => opened) {
  const name = `posopen${uuidv7().replaceAll('-', '')}`;
  const validating = wrappedValidateAjvStorage({ storage });
  const open = (validated = true) => createRxDatabase({ name, storage: wrap(validated ? validating : storage), multiInstance: false });
  /** The older app: opens `pos_orders` at version `from`, runs `step` on it, and closes. */
  const olderApp = async (step: (orders: any) => Promise<unknown>) => {
    const db = await open(false);
    await step((await db.addCollections({ pos_orders: olderCollection(from) })).pos_orders);
    await db.close();
  };
  /** Every order in each version's storage, read beneath RxDB, without its storage metadata, oldest first. */
  const stored = async () => {
    const [v0, v1] = await Promise.all([olderCollection(from).schema, posOrderSchema].map(async (schema) => {
      const raw = await storage.createStorageInstance<PosOrder>({ databaseName: name, collectionName: 'pos_orders',
        schema: fillWithDefaultSettings(schema), options: {}, multiInstance: false, devMode: false, databaseInstanceToken: 'check' });
      const query = normalizeMangoQuery(raw.schema, { selector: {}, sort: [{ id: 'asc' }] });
      const { documents } = await raw.query(prepareQuery(raw.schema, query));
      await raw.close();
      return documents.map(({ _rev, _meta, _attachments, _deleted, ...doc }) => doc);
    }));
    return { v0, v1, ids: { v0: v0.map((doc) => doc.id), v1: v1.map((doc) => doc.id) } };
  };
  return { open, olderApp, stored };
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
export function addPosOrderCollectionTests(makeStorage: () => RxStorage<any, any>, { sqlite = false, from = 0 as Origin } = {}) {
  // A version-1 order carries its session, which the migration keeps.
  const order = (n: number, syncStatus?: string): PosOrder => ({ ...sale(n, syncStatus), ...(from === 1 ? { sessionId: `session-${n}` } : {}) });

  it('after a DM4, the fixed order migrates on the very next open, with every order byte for byte', async () => {
    const { open, olderApp, stored } = store(makeStorage(), from);
    const [good, bad] = [order(1), order(2, 'queued')];
    await olderApp((orders) => orders.bulkInsert([good, bad]));
    expect((await stored()).ids).toEqual({ v0: [good.id, bad.id], v1: [] });

    const first = await open();
    await expect(addPosOrderCollection(first)).rejects.toMatchObject({ code: 'DM4' });
    await first.close();
    // The good order is copied, and both are still in the older version.
    expect((await stored()).ids).toEqual({ v0: [good.id, bad.id], v1: [good.id] });

    const fixed = { ...bad, syncStatus: 'pending' as const };
    await olderApp(async (orders) => (await orders.findOne(bad.id).exec()).incrementalPatch({ syncStatus: 'pending' }));
    const next = await open();
    const pos = await addPosOrderCollection(next);
    expect((await pos.find().exec()).map((doc) => doc.toJSON())).toStrictEqual([good, fixed]);
    await next.close();
    expect(await stored()).toMatchObject({ v0: [], v1: [good, fixed] });
  });

  it('rapid DM4 retries on one database raise no unhandled rejection, and the fixed open migrates every order once', async () => {
    const unhandled: unknown[] = [];
    const spy = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', spy);
    try {
      const { open, olderApp, stored } = store(makeStorage(), from);
      const [good, bad] = [order(1), order(2, 'queued')];
      await olderApp((orders) => orders.bulkInsert([good, bad]));
      const db = await open();
      for (let attempt = 0; attempt < 4; attempt++) {
        await expect(addPosOrderCollection(db)).rejects.toMatchObject({ code: 'DM4' });
        expect(await stored()).toMatchObject({ v0: [good, bad], v1: [good] });
      }
      await db.close();

      const fixed = { ...bad, syncStatus: 'pending' as const };
      await olderApp(async (orders) => (await orders.findOne(bad.id).exec()).incrementalPatch({ syncStatus: 'pending' }));
      // The failed runs' replications do not wake on that write: no checkpoint into a removed store, and no copy.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(unhandled).toEqual([]);
      expect(await stored()).toMatchObject({ v0: [good, fixed], v1: [good] });
      const next = await open();
      const pos = await addPosOrderCollection(next);
      expect((await pos.find().exec()).map((doc) => doc.toJSON())).toStrictEqual([good, fixed]);
      await next.close();
      expect(await stored()).toMatchObject({ v0: [], v1: [good, fixed] });
      // Long enough for a stray replication write to reject.
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', spy);
    }
  });

  it.runIf(sqlite)('repeated opens closed mid-open or straight after they settle lose and duplicate nothing, and the fixed open migrates all', async () => {
    const { open, olderApp, stored } = store(makeStorage(), from, slow);
    // Three migration batches (RxDB's 200); the invalid order is in the last.
    const orders = [...Array.from({ length: 450 }, (_, i) => order(i + 1)), order(451, 'queued')];
    const ids = orders.map((o) => o.id);
    await olderApp((collection) => collection.bulkInsert(orders));
    /** Opens, closes after `wait` ms (mid-migration when short), and reads both storages. */
    const cycle = async (wait: number) => {
      const db = await open();
      const opening = addPosOrderCollection(db).then(() => 'resolved', (e) => e.code);
      await new Promise((resolve) => setTimeout(resolve, wait));
      await db.close();
      return { outcome: await opening, ...(await stored()).ids };
    };
    // Every valid order is copied, and every order stays in the older version until all can move.
    for (const wait of [0, 10, 30, 500]) expect(await cycle(wait)).toEqual({ outcome: 'DM4', v0: ids, v1: ids.slice(0, 450) });

    await olderApp(async (collection) => (await collection.findOne(ids[450]).exec()).incrementalPatch({ syncStatus: 'pending' }));
    for (const wait of [0, 10, 500]) expect(await cycle(wait)).toEqual({ outcome: 'resolved', v0: [], v1: ids });
    expect((await stored()).v1).toStrictEqual([...orders.slice(0, 450), { ...orders[450], syncStatus: 'pending' }]);
  }, 60000);

  /**
   * Opens, and closes once the open reaches the first storage instance `pause` matches, which a
   * timer then delays (like a SQLite worker's round trip). The close must wait for the whole open:
   * it resolves, every order moves once, and a later open on the same storage (one SQLite handle)
   * can still write, where a write to a closed instance would have poisoned it (rxdb-premium bug 6).
   */
  const closedMidOpen = async (pause: (params: RxStorageInstanceCreationParams<any, any>) => boolean) => {
    let reached!: () => void;
    const paused = new Promise<void>((resolve) => { reached = resolve; });
    const pausing = (storage: RxStorage<any, any>): RxStorage<any, any> => ({ ...storage, createStorageInstance: async (params) => {
      if (pause(params)) { reached(); await new Promise((resolve) => setTimeout(resolve, 20)); }
      return storage.createStorageInstance(params);
    } });
    const { open, olderApp, stored } = store(makeStorage(), from, pausing);
    const orders = [order(1), order(2), order(3)];
    await olderApp((collection) => collection.bulkInsert(orders));
    const db = await open();
    const opening = addPosOrderCollection(db).then(() => 'resolved', (error: unknown) => error);
    await paused;
    await db.close();
    expect(await opening).toBe('resolved');
    expect(await stored()).toMatchObject({ v0: [], v1: orders });

    const next = await open();
    const pos = await addPosOrderCollection(next);
    await pos.insert(order(4));
    expect((await pos.find().exec()).map((doc) => doc.toJSON())).toStrictEqual([...orders, order(4)]);
    await next.close();
    expect(await stored()).toMatchObject({ v0: [], v1: [...orders, order(4)] });
  };

  it('a close while the open removes the migration checkpoint waits for the whole open, and the same storage writes after', () =>
    closedMidOpen((params) => params.collectionName.startsWith('rx-migration-state-meta-')));

  it('a close while the open adds the collection waits for the whole open, and the same storage writes after', () =>
    closedMidOpen((params) => params.collectionName === 'pos_orders' && params.schema.version === posOrderSchema.version));

  /**
   * A close that stops waiting (a 50 ms limit) mid-migration. The run's first read of the current version,
   * taken just before its first write (replication-protocol/index.js:162, :185), answers only once the close
   * has resolved, or (`midClose`) once the close is closing the internal store, its last step, before
   * `db.closed` is set. No write may reach a closed store: the open rejects with the coded error, the close is
   * prompt, nothing is unhandled, and a later open on the same storage (one SQLite handle) migrates every
   * order once and still writes, where a write to a closed instance would have poisoned it (rxdb-premium bug 6).
   */
  const closeGivesUp = async (midClose: boolean) => {
    const unhandled: unknown[] = [];
    const spy = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', spy);
    const warnings: LogEntry[] = [];
    posOrdersLogger.addSink(callbackSink({ id: 'close-gives-up', levels: ['warn'], callback: (entry) => warnings.push(entry) }));
    try {
      let holding = false;
      let reached!: () => void;
      let closingInternal!: () => void;
      let release!: () => void;
      const read = new Promise<void>((resolve) => { reached = resolve; });
      const internalClose = new Promise<void>((resolve) => { closingInternal = resolve; });
      const released = new Promise<void>((resolve) => { release = resolve; });
      const hold = (storage: RxStorage<any, any>): RxStorage<any, any> => ({ ...storage, createStorageInstance: async (params) => {
        const instance = await storage.createStorageInstance(params);
        const current = params.collectionName === 'pos_orders' && params.schema.version === posOrderSchema.version;
        return new Proxy(instance, { get: (target: any, key) => {
          // Only the migration's own read passes `withDeleted`; the open's stale-copy check does not.
          if (holding && current && key === 'findDocumentsById') return async (ids: string[], withDeleted: boolean) => {
            const found = await target.findDocumentsById(ids, withDeleted);
            if (withDeleted) { reached(); await released; }
            return found;
          };
          if (holding && midClose && params.collectionName === INTERNAL_STORAGE_NAME && key === 'close') {
            return async () => { closingInternal(); await released; return target.close(); };
          }
          return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
        } });
      } });
      const { open, olderApp, stored } = store(makeStorage(), from, hold);
      const orders = [order(1), order(2), order(3)];
      await olderApp((collection) => collection.bulkInsert(orders));

      holding = true;
      const db = await open();
      const opening = addPosOrderCollection(db, 50).then(() => 'resolved', (error: unknown) => error);
      await read;
      const started = Date.now();
      const closing = db.close();
      await (midClose ? internalClose : closing);
      const elapsed = Date.now() - started;
      expect(db.closed).toBe(!midClose);
      holding = false;
      release();
      const error = await opening;
      await closing;
      expect(error).toBeInstanceOf(PosOrderOpenClosedError);
      expect(error).toMatchObject({ code: 'POS_ORDER_OPEN_CLOSED' });
      expect(elapsed).toBeLessThan(5000);
      // The run's ERROR status was dropped, and logged with its key.
      expect(warnings).toContainEqual(expect.objectContaining({ scope: 'pos-orders', data: { database: db.name, ids: [STATUS_ID] } }));
      // Nothing reached the current version, and every order waits in the older one.
      expect((await stored()).ids).toEqual({ v0: orders.map((o) => o.id), v1: [] });
      // Long enough for a stray write to reject.
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(unhandled).toEqual([]);

      const next = await open();
      const pos = await addPosOrderCollection(next);
      await pos.insert(order(4));
      expect((await pos.find().exec()).map((doc) => doc.toJSON())).toStrictEqual([...orders, order(4)]);
      await next.close();
      expect(await stored()).toMatchObject({ v0: [], v1: [...orders, order(4)] });
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', spy);
      posOrdersLogger.removeSink('close-gives-up');
    }
  };

  it('a close that stops waiting mid-migration lets no write reach a closed store: the open rejects with the coded error, and the same storage migrates every order once after',
    () => closeGivesUp(false), 30000);

  it('once the close stops waiting, the migration writes nothing even before the close has finished closing storage', () => closeGivesUp(true), 30000);

  /**
   * A close that stops waiting after the migration is DONE, while the open reads the status. RxDB's close
   * runs its `onClose` handlers only once the database is idle (rx-database.js:381), and that read holds it
   * busy (the internal store's reads are locked runs, rx-storage-helper.js:486), so the close begins
   * mid-migration: the run's first read of the current version waits for it. The open's status read then
   * answers only once the limit has passed, and the collections' close is waiting for it.
   */
  it('a close that stops waiting once the migration is DONE, while the open reads its status, rejects with the coded error', async () => {
    const unhandled: unknown[] = [];
    const spy = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', spy);
    try {
      const limit = 500;
      let holding = false;
      let done = false;
      let migrating!: () => void;
      let statusRead!: () => void;
      let resumeMigration!: () => void;
      let release!: () => void;
      const migrationRead = new Promise<void>((resolve) => { migrating = resolve; });
      const read = new Promise<void>((resolve) => { statusRead = resolve; });
      const resumed = new Promise<void>((resolve) => { resumeMigration = resolve; });
      const released = new Promise<void>((resolve) => { release = resolve; });
      const hold = (storage: RxStorage<any, any>): RxStorage<any, any> => ({ ...storage, createStorageInstance: async (params) => {
        const instance = await storage.createStorageInstance(params);
        const current = params.collectionName === 'pos_orders' && params.schema.version === posOrderSchema.version;
        const internal = params.collectionName === INTERNAL_STORAGE_NAME;
        return new Proxy(instance, { get: (target: any, key) => {
          if (holding && current && key === 'findDocumentsById') return async (ids: string[], withDeleted: boolean) => {
            if (withDeleted) { migrating(); await resumed; }
            return target.findDocumentsById(ids, withDeleted);
          };
          // Once the run has written DONE, the next status read is the open's own.
          if (holding && internal && key === 'bulkWrite') return (rows: any[], context: string) => {
            if (rows.some((row) => row.document.id === STATUS_ID && row.document.data.status === 'DONE')) done = true;
            return target.bulkWrite(rows, context);
          };
          if (holding && internal && key === 'findDocumentsById') return async (ids: string[], withDeleted: boolean) => {
            if (done && ids.includes(STATUS_ID)) { done = false; statusRead(); await released; }
            return target.findDocumentsById(ids, withDeleted);
          };
          return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
        } });
      } });
      const { open, olderApp, stored } = store(makeStorage(), from, hold);
      const orders = [order(1), order(2), order(3)];
      await olderApp((collection) => collection.bulkInsert(orders));

      holding = true;
      const db = await open();
      const opening = addPosOrderCollection(db, limit).then(() => 'resolved', (error: unknown) => error);
      await migrationRead;
      let waitStarted!: () => void;
      const waiting = new Promise<void>((resolve) => { waitStarted = resolve; });
      db.onClose.push(async () => waitStarted());
      const closing = db.close();
      // The close's wait for the open has begun: the migration finishes, and the open's status read waits past the limit.
      await waiting;
      resumeMigration();
      await read;
      await new Promise((resolve) => setTimeout(resolve, limit + 200));
      expect(db.closed).toBe(false);
      holding = false;
      release();
      const error = await opening;
      await closing;
      expect(error).toBeInstanceOf(PosOrderOpenClosedError);
      expect(error).toMatchObject({ code: 'POS_ORDER_OPEN_CLOSED' });
      // The run had finished: every order is in the current version, once.
      expect(await stored()).toMatchObject({ v0: [], v1: orders });

      const next = await open();
      const pos = await addPosOrderCollection(next);
      await pos.insert(order(4));
      expect((await pos.find().exec()).map((doc) => doc.toJSON())).toStrictEqual([...orders, order(4)]);
      await next.close();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', spy);
    }
  }, 30000);

  it(`after a rollback to the version-${from} app, its new sales migrate before the reopen resolves`, async () => {
    const { open, olderApp, stored } = store(makeStorage(), from);
    const [first, ...rolledBack] = [order(1), order(2), order(3)];
    await olderApp((orders) => orders.insert(first));
    const upgraded = await open();
    await addPosOrderCollection(upgraded);
    expect(await status(upgraded)).toMatchObject({ status: 'DONE', count: { total: 1, handled: 1 } });
    await upgraded.close();
    expect((await stored()).ids).toEqual({ v0: [], v1: [first.id] });

    await olderApp((orders) => orders.bulkInsert(rolledBack));
    expect((await stored()).ids).toEqual({ v0: rolledBack.map((o) => o.id), v1: [first.id] });

    const reupgraded = await open();
    const pos = await addPosOrderCollection(reupgraded);
    expect((await pos.find().exec()).map((doc) => doc.toJSON())).toStrictEqual([first, ...rolledBack]);
    // The status describes this run, not the one before the rollback.
    expect(await status(reupgraded)).toMatchObject({ status: 'DONE', count: { total: 2, handled: 2 } });
    await reupgraded.close();
    expect(await stored()).toMatchObject({ v0: [], v1: [first, ...rolledBack] });
  });

  it(`after a rollback sent or rejected orders a failed run had copied, the re-upgrade keeps the version-${from} states, and a pending one stays pending`, async () => {
    // Slow writes let a test timeout fire should RxDB's migration loop on these conflicts.
    const { open, olderApp, stored } = store(makeStorage(), from, slow);
    const [sent, refused, unsent, bad] = [order(1), order(2), order(3), order(4, 'queued')];
    await olderApp((orders) => orders.bulkInsert([sent, refused, unsent, bad]));
    const failed = await open();
    await expect(addPosOrderCollection(failed)).rejects.toMatchObject({ code: 'DM4' });
    await failed.close();
    expect(await stored()).toMatchObject({ v1: [sent, refused, unsent] });

    // The rolled-back older app sends one, has one rejected, and fixes the invalid one.
    const at = '2026-09-25T01:00:00.000Z';
    const applied = { ...sent, syncStatus: 'applied' as const, serverRefs: { orderId: 'server-1', totalMinor: 100 }, updatedAt: at };
    const rejected = { ...refused, syncStatus: 'rejected' as const, error: { code: 'validation', message: 'no' }, updatedAt: at };
    const fixed = { ...bad, syncStatus: 'pending' as const };
    await olderApp(async (orders) => {
      for (const next of [applied, rejected, fixed]) await (await orders.findOne(next.id).exec()).incrementalPatch(next);
    });
    expect(await stored()).toMatchObject({ v0: [applied, rejected, unsent, fixed], v1: [sent, refused, unsent] });

    const reupgraded = await open();
    const pos = await addPosOrderCollection(reupgraded);
    expect((await pos.find().exec()).map((doc) => doc.toJSON())).toStrictEqual([applied, rejected, unsent, fixed]);
    expect(await pos.count({ selector: { syncStatus: 'pending' } }).exec()).toBe(2);
    await reupgraded.close();
    expect(await stored()).toMatchObject({ v0: [], v1: [applied, rejected, unsent, fixed] });
  });

  it('a genuinely invalid order rejects with DM4 after the migration has stopped, and every order is kept', async () => {
    const { open, olderApp, stored } = store(makeStorage(), from);
    const [good, bad] = [order(1), order(2, 'queued')];
    await olderApp((orders) => orders.bulkInsert([good, bad]));
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
    const db = await store(makeStorage(), from).open();
    await (await addPosOrderCollection(db)).insert(order(1));
    expect(await status(db)).toBeUndefined();
    await expect(addPosOrderCollection(db)).rejects.toMatchObject({ code: 'DB3' });
    await db.close();
  });
}

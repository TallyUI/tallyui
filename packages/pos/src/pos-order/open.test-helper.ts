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
import { createOrderBuilder } from '../order/order-builder';
import { mintUuid } from '../register/register-document';
import { DEFAULT_TAX_ROUNDING } from '../tax/exact';
import { finalizeOrder } from './finalize';
import { addPosOrderCollection, PosOrderOpenClosedError, posOrdersLogger } from './open';
import { posOrderSchema } from './schema';
import type { PosOrder } from './types';
import { uuidv7 } from './uuidv7';

/** The version-6 schema: before `saleId`. */
export function versionSix(): RxJsonSchema<PosOrder> {
  const schema = structuredClone(posOrderSchema);
  delete (schema.properties as Record<string, unknown>).saleId;
  return { ...schema, version: 6 };
}

/** The version-5 schema: before `taxRounding`. */
export function versionFive(): RxJsonSchema<PosOrder> {
  const schema = versionSix();
  delete (schema.properties as Record<string, unknown>).taxRounding;
  return { ...schema, required: schema.required!.filter((key) => key !== 'taxRounding'), version: 5 };
}

/** The version-4 schema: `sentVersion` and `downgradedFrom` at most 3. */
export function versionFour(): RxJsonSchema<PosOrder> {
  const schema = versionFive();
  schema.properties.sentVersion.maximum = 3;
  schema.properties.downgradedFrom.maximum = 3;
  return { ...schema, version: 4 };
}

/** The shipped version-3 schema: before localWarnings and serverFailures. */
export function versionThree(): RxJsonSchema<PosOrder> {
  const schema = versionFour();
  for (const key of ['localWarnings', 'serverFailures']) delete (schema.properties as Record<string, unknown>)[key];
  return { ...schema, version: 3 };
}

/** The shipped version-2 schema: before the sessionId index and maxLength. */
export function versionTwo(): RxJsonSchema<PosOrder> {
  const schema = versionThree();
  schema.indexes = schema.indexes!.filter((index) => index !== 'sessionId');
  delete schema.properties.sessionId.maxLength;
  for (const key of ['sentVersion', 'downgradedFrom']) delete (schema.properties as Record<string, unknown>)[key];
  return { ...schema, version: 2 };
}

/** The shipped version-1 schema: version 2 with its only additions, `lateSessionId`, `display` and `taxByRate`, taken out. */
export function versionOne(): RxJsonSchema<PosOrder> {
  const schema = versionTwo();
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
export type Origin = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** `pos_orders` as the shipped app at `from` added it: version 1 came with its identity strategy. */
export function olderCollection(from: Origin): RxCollectionCreator<PosOrder> {
  addRxPlugin(RxDBMigrationSchemaPlugin);
  const identity = (doc: PosOrder) => doc;
  if (from === 6) return { schema: versionSix(), migrationStrategies: { 1: identity, 2: identity, 3: identity, 4: identity, 5: identity, 6: identity } };
  if (from === 5) return { schema: versionFive(), migrationStrategies: { 1: identity, 2: identity, 3: identity, 4: identity, 5: identity } };
  if (from === 4) return { schema: versionFour(), migrationStrategies: { 1: identity, 2: identity, 3: identity, 4: identity } };
  if (from === 3) return { schema: versionThree(), migrationStrategies: { 1: (doc: PosOrder) => doc, 2: (doc: PosOrder) => doc, 3: (doc: PosOrder) => doc } };
  if (from === 2) return { schema: versionTwo(), migrationStrategies: { 1: (doc: PosOrder) => doc, 2: (doc: PosOrder) => doc } };
  return from === 0 ? { schema: versionZero() } : { schema: versionOne(), migrationStrategies: { 1: (doc: PosOrder) => doc } };
}

/** A pending sale; `syncStatus: 'queued'` makes one no version's validator accepts. */
/** A sale stored before version 6/7, which recorded no tax rounding or sale id. */
export type OlderPosOrder = Omit<PosOrder, 'taxRounding' | 'saleId'>;

function sale(n: number, syncStatus = 'pending'): OlderPosOrder {
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
  const order = (n: number, syncStatus?: string): OlderPosOrder => ({ ...sale(n, syncStatus), ...(from >= 1 ? { sessionId: `session-${n}` } : {}) });
  // Version 5's migration records each order's content version as sent: a sale() has no discount, so 1. Version 6's
  // records the default tax rounding.
  const moved = (...orders: OlderPosOrder[]) => orders.map((o) => ({ ...o, sentVersion: o.sentVersion ?? 1, taxRounding: DEFAULT_TAX_ROUNDING }));
  // A sale rung at the current version, which finalize records its tax rounding on.
  const current = (n: number): PosOrder => ({ ...order(n), taxRounding: DEFAULT_TAX_ROUNDING });

  if (from === 2) {
    it.each([true, false])('keeps a pending version-2 order with sessionId, lateSessionId, display and taxByRate byte for byte (validated: %s)', async (validated) => {
      const { open, olderApp, stored } = store(makeStorage(), from);
      const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 190000, pricesIncludeTax: false } });
      builder.addLine({ productId: 'p1', variantId: 'v1', name: 'Item 1', sku: 'SKU1', unitPrice: { amount: 850, currency: 'EUR' }, quantity: 2,
        taxRates: [{ code: 'VAT', ratePpm: 190000 }] });
      builder.addLine({ productId: 'p2', name: 'Item 2', unitPrice: { amount: 1200, currency: 'EUR' } });
      builder.addPayment({ method: 'external', amountMinor: 1000, reference: 'terminal' });
      builder.addPayment({ method: 'cash', amountMinor: 3000 });
      builder.setCustomer({ id: 'c1', name: 'Customer', email: 'buyer@example.com' });
      builder.setNote('Sale note');
      // A version-2 till recorded no tax rounding.
      const { taxRounding: _rounding, saleId: _saleId, ...finalized } = finalizeOrder(builder.getSnapshot(), { registerId: 'r1', cashierRef: 'staff1',
        capabilities: { orderCreate: 3 } });
      const original = { ...finalized, lines: [{ ...finalized.lines[0], taxInclusive: true }, finalized.lines[1]],
        sessionId: mintUuid(), lateSessionId: mintUuid(), warnings: [{ code: 'total_mismatch', expectedMinor: 3451, serverMinor: 3452 }],
        error: { code: 'network', message: 'fetch failed' } };
      let metadata: unknown;
      await olderApp(async (orders) => { metadata = (await orders.insert(original)).toJSON(true)._meta; });
      const db = await open(validated);
      try {
        const pos = await addPosOrderCollection(db);
        const migrated = await pos.findOne(original.id).exec();
        expect(migrated?.toJSON()).toStrictEqual({ ...original, sentVersion: 3, taxRounding: DEFAULT_TAX_ROUNDING });
        expect(migrated?.toJSON(true)._meta).toStrictEqual(metadata);
        const pending = await pos.find({ selector: { syncStatus: 'pending' }, sort: [{ createdAt: 'asc' }] }).exec();
        expect(pending.map((doc) => doc.toJSON())).toStrictEqual([{ ...original, sentVersion: 3, taxRounding: DEFAULT_TAX_ROUNDING }]);
      } finally {
        await db.close();
      }
      expect(await stored()).toMatchObject({ v0: [], v1: [original] });
    });

    it.each([true, false])('never drops a version-2 order whose sessionId is longer than 36 characters (validated: %s)', async (validated) => {
      const { open, olderApp, stored } = store(makeStorage(), from);
      const original = { ...order(1), sessionId: 's'.repeat(37) };
      await olderApp((orders) => orders.insert(original));
      const before = await stored();
      const db = await open(validated);
      try {
        if (validated) {
          const error = await addPosOrderCollection(db).catch((e: unknown) => e);
          expect(error).toMatchObject({ code: 'DM4' });
          expect(JSON.stringify(error)).toContain('/sessionId');
        } else {
          const pos = await addPosOrderCollection(db);
          expect((await pos.findOne(original.id).exec())?.toJSON()).toStrictEqual(moved(original)[0]);
          const pending = await pos.find({ selector: { syncStatus: 'pending' }, sort: [{ createdAt: 'asc' }] }).exec();
          expect(pending.map((doc) => doc.toJSON())).toStrictEqual(moved(original));
        }
      } finally {
        await db.close();
      }
      expect(await stored()).toStrictEqual(validated ? before : { v0: [], v1: moved(original), ids: { v0: [], v1: [original.id] } });
    });
  }

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
    expect((await pos.find().exec()).map((doc) => doc.toJSON())).toStrictEqual(moved(good, fixed));
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
      expect((await pos.find().exec()).map((doc) => doc.toJSON())).toStrictEqual(moved(good, fixed));
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
    // Set, the run's next write to the current version waits for `release` (after `reached`).
    let hold: { reached: () => void; released: Promise<void> } | undefined;
    const holdWrite = (storage: RxStorage<any, any>): RxStorage<any, any> => ({ ...storage, createStorageInstance: async (params) => {
      const instance = await storage.createStorageInstance(params);
      if (params.collectionName !== 'pos_orders' || params.schema.version !== posOrderSchema.version) return instance;
      return new Proxy(instance, { get: (target: any, key) => (key === 'bulkWrite' && hold
        ? async (...args: any[]) => { const held = hold!; hold = undefined; held.reached(); await held.released; return target.bulkWrite(...args); }
        : typeof target[key] === 'function' ? target[key].bind(target) : target[key]) });
    } });
    const { open, olderApp, stored } = store(makeStorage(), from, (storage) => holdWrite(slow(storage)));
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
    // RxDB 17.5 cancels a run the close interrupts, so a cycle ends as it would have (DM4, or resolved once
    // fixed) or with the coded closed error. Safe means: the two versions together hold every order, neither
    // holds one twice, and the invalid order never moves. (A cancel can land after the run removed the
    // older version but before it deleted that version's record.)
    const check = ({ outcome, v0, v1 }: { outcome: string; v0: string[]; v1: string[] }, expected: string) => {
      expect([expected, 'POS_ORDER_OPEN_CLOSED']).toContain(outcome);
      expect(new Set(v0).size).toBe(v0.length);
      expect(new Set(v1).size).toBe(v1.length);
      expect([...new Set([...v0, ...v1])].sort()).toEqual(ids);
    };

    // One cycle closes while the run's first write to the current version is held, so the close cancels
    // the run for certain: the open settles with the coded error once that write has landed.
    const db = await open();
    let reached!: () => void;
    let release!: () => void;
    const reachedWrite = new Promise<void>((resolve) => { reached = resolve; });
    hold = { reached, released: new Promise<void>((resolve) => { release = resolve; }) };
    const opening = addPosOrderCollection(db).then(() => 'resolved', (e) => e.code);
    let settledOpen = false;
    opening.finally(() => { settledOpen = true; }).catch(() => {});
    await reachedWrite;
    // Pushed after RxDB's own cancel hook, and every `onClose` handler starts at once: once this one runs, the run is cancelled.
    let cancelling!: () => void;
    const cancelled = new Promise<void>((resolve) => { cancelling = resolve; });
    db.onClose.push(async () => cancelling());
    const closing = db.close();
    await cancelled;
    await new Promise((r) => setTimeout(r, 0));
    expect(settledOpen).toBe(false);
    release();
    await closing;
    const first = { outcome: await opening, ...(await stored()).ids };
    expect(first.outcome).toBe('POS_ORDER_OPEN_CLOSED');
    check(first, 'DM4');
    expect(first.v1).not.toContain(ids[450]);

    for (const wait of [0, 10, 30, 500]) {
      const result = await cycle(wait);
      check(result, 'DM4');
      expect(result.v1).not.toContain(ids[450]);
    }

    await olderApp(async (collection) => (await collection.findOne(ids[450]).exec()).incrementalPatch({ syncStatus: 'pending' }));
    for (const wait of [0, 10, 500]) check(await cycle(wait), 'resolved');
    // An open no close interrupts moves every order.
    const last = await open();
    await addPosOrderCollection(last);
    await last.close();
    expect((await stored()).v0).toEqual([]);
    expect((await stored()).v1).toStrictEqual(moved(...orders.slice(0, 450), { ...orders[450], syncStatus: 'pending' }));
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
    await pos.insert(current(4));
    expect((await pos.find().exec()).map((doc) => doc.toJSON())).toStrictEqual([...moved(...orders), current(4)]);
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
      // No ERROR status for the run: RxDB 17.5.0's `cancel()` stops the run before it can write one.
      expect(warnings).not.toContainEqual(expect.objectContaining({ scope: 'pos-orders', data: { database: db.name, ids: [STATUS_ID] } }));
      // Nothing reached the current version, and every order waits in the older one.
      expect((await stored()).ids).toEqual({ v0: orders.map((o) => o.id), v1: [] });
      // Long enough for a stray write to reject.
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(unhandled).toEqual([]);

      const next = await open();
      // The stored status is still the open's own reset, RUNNING: the cancelled run wrote neither ERROR nor DONE.
      expect((await status(next))?.status).toBe('RUNNING');
      const pos = await addPosOrderCollection(next);
      await pos.insert(current(4));
      expect((await pos.find().exec()).map((doc) => doc.toJSON())).toStrictEqual([...moved(...orders), current(4)]);
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
   * A close that begins after the migration is DONE, while the open reads the status (its first step once
   * `startMigration()` has settled). RxDB 17.5 cancels a run the close interrupts, so a close that begins
   * mid-migration is covered above; this one finds the run already settled, and the open resolves. RxDB's
   * close runs its `onClose` handlers only once the database is idle, and the held read keeps it busy (the
   * internal store's reads are locked runs), so the close waits for the open.
   */
  it('a close that begins once the migration is DONE, while the open reads its status, leaves every order moved once', async () => {
    const unhandled: unknown[] = [];
    const spy = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', spy);
    try {
      const limit = 500;
      let holding = false;
      let done = false;
      let statusRead!: () => void;
      let release!: () => void;
      const read = new Promise<void>((resolve) => { statusRead = resolve; });
      const released = new Promise<void>((resolve) => { release = resolve; });
      const hold = (storage: RxStorage<any, any>): RxStorage<any, any> => ({ ...storage, createStorageInstance: async (params) => {
        const instance = await storage.createStorageInstance(params);
        const internal = params.collectionName === INTERNAL_STORAGE_NAME;
        return new Proxy(instance, { get: (target: any, key) => {
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
      // The run is DONE and the open reads its status: the close begins now, and waits past the limit.
      await read;
      const closing = db.close();
      await new Promise((resolve) => setTimeout(resolve, limit + 200));
      expect(db.closed).toBe(false);
      holding = false;
      release();
      expect(await opening).toBe('resolved');
      await closing;
      // The run had finished: every order is in the current version, once.
      expect(await stored()).toMatchObject({ v0: [], v1: orders });

      const next = await open();
      const pos = await addPosOrderCollection(next);
      await pos.insert(current(4));
      expect((await pos.find().exec()).map((doc) => doc.toJSON())).toStrictEqual([...moved(...orders), current(4)]);
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
    expect((await pos.find().exec()).map((doc) => doc.toJSON())).toStrictEqual(moved(first, ...rolledBack));
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
    expect((await pos.find().exec()).map((doc) => doc.toJSON())).toStrictEqual(moved(applied, rejected, unsent, fixed));
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
      expect(v1).toStrictEqual(moved(good));
    }
  });

  it('opens a new database without migrating, and refuses a second pos_orders', async () => {
    const db = await store(makeStorage(), from).open();
    await (await addPosOrderCollection(db)).insert(current(1));
    expect(await status(db)).toBeUndefined();
    await expect(addPosOrderCollection(db)).rejects.toMatchObject({ code: 'DB3' });
    await db.close();
  });
}

import {
  deepEqual, defaultConflictHandler, getChangedDocumentsSince, getRxReplicationMetaInstanceSchema, getSingleDocument, hasEncryption, newRxError,
  overwritable, rxStorageInstanceToReplicationHandler, type RxCollection, type RxDatabase, type RxStorageInstance,
} from 'rxdb';
import { getOldCollectionMeta, migrateDocumentData, type RxMigrationStatus } from 'rxdb/plugins/migration-schema';
import { Subject, takeUntil } from 'rxjs';
import { createLogger } from '../logging';
import { posOrderCollection } from './schema';
import type { PosOrder } from './types';

/** `addPosOrderCollection`'s logger: attach a sink to see, for example, the status writes a closing open dropped. */
export const posOrdersLogger = createLogger('pos-orders');

/**
 * After this long waiting for the open, a close gives up rather than hang forever. RxDB 17.5 cancels
 * a running migration as the database closes, and the open then rejects with
 * `PosOrderOpenClosedError`; the run reads or writes nothing more in a store the close closes (see
 * `openPosOrders`). The next open finds the leftover `RUNNING` status, resets it and the checkpoint,
 * and migrates again. An order that run already copied is found equal and skipped, so no order is lost.
 */
export const POS_ORDER_MIGRATION_CLOSE_WAIT_MS = 10_000;

/**
 * `addPosOrderCollection` stopped, before any further write, because its database is closing: it
 * was called once `close()` had begun, the close cancelled its migration (RxDB 17.5), or the close
 * stopped waiting for it (after `POS_ORDER_MIGRATION_CLOSE_WAIT_MS`). No order is lost: reopen the
 * database and call it again.
 */
export class PosOrderOpenClosedError extends Error {
  readonly code = 'POS_ORDER_OPEN_CLOSED';
  constructor(readonly databaseName: string) {
    super(`addPosOrderCollection: database ${databaseName} closed during the open; reopen it and open pos_orders again`);
    this.name = 'PosOrderOpenClosedError';
  }
}

/** Every open per database so far, settled or not: one promise, so a close waits for all of them
 * across DM4 retries with one handler, and a new open's reset waits for every earlier migration. */
const latestOpens = new WeakMap<RxDatabase, Promise<unknown>>();
/** Databases whose close stopped waiting (the limit passed), so storage is closing under the open. */
const closedUnderOpen = new WeakSet<RxDatabase>();

/** Resolves true once `promise` settles, or false after `ms`. */
function waitWithTimeout(promise: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    promise.finally(() => { clearTimeout(timer); resolve(true); });
  });
}

/**
 * Writes each order of the stored older version over its differing copy in the current version,
 * through the same write RxDB's migration makes, and leaves orders without a copy (and any deleted
 * one) to the migration. `from` is whichever older version is stored, 0, 1 or 2.
 */
async function writeOverStaleCopies(collection: RxCollection, from: RxStorageInstance<any, any, any>, to: RxStorageInstance<any, any, any>,
  stopIfClosing: () => void) {
  const handler = rxStorageInstanceToReplicationHandler(to, defaultConflictHandler, collection.database.token, true);
  for (let page = await getChangedDocumentsSince(from, 200); page.documents.length > 0;
    page = await getChangedDocumentsSince(from, 200, page.checkpoint)) {
    stopIfClosing();
    const copies = new Map((await to.findDocumentsById(page.documents.map((doc) => doc.id), false)).map((copy) => [copy.id, copy]));
    const rows = await Promise.all(page.documents.filter((doc) => copies.has(doc.id) && !doc._deleted).map(async (doc) =>
      ({ assumedMasterState: copies.get(doc.id), newDocumentState: await migrateDocumentData(collection, from.schema.version, doc) })));
    const stale = rows.filter((row) => row.newDocumentState && !deepEqual(row.assumedMasterState, row.newDocumentState));
    // A write error (an older state the current version refuses) stops the run with DM4, as RxDB's own write does.
    if (stale.length > 0) await handler.masterWrite(stale);
  }
}

/**
 * Adds `pos_orders` to `db` and resolves once no order of an older version is left to migrate. The one
 * sanctioned way to open it (ADR-032 amendment 2). On DM4 it rejects after the migration has
 * stopped and closes the collection, so the app can surface the error and open again; it never
 * deletes an order.
 *
 * RxDB 17.5.0 trusts the status its last migration stored: a leftover `ERROR` rejects
 * `migratePromise` at once while the migration keeps running (a close then interrupts it), and a
 * `DONE` left before a rollback resolves it before the older version's new orders have moved. So the
 * collection is added without `autoMigrate`, the status and a failed run's checkpoint are reset
 * (never an order or its storage), and the migration itself is awaited.
 *
 * A close waits for the open, up to `POS_ORDER_MIGRATION_CLOSE_WAIT_MS`, and cancels a running
 * migration (RxDB 17.5). Called once the database's close has begun, when the close cancels its
 * migration, or when the close stops waiting, it rejects with `PosOrderOpenClosedError`
 * (`code: 'POS_ORDER_OPEN_CLOSED'`) before any further write: reopen and call it again. Any other
 * rejection (DM4, a storage error) is a real failure.
 *
 * `closeWaitMs` is for tests only; the first open on a database sets it for that database's close.
 */
export async function addPosOrderCollection(db: RxDatabase, closeWaitMs = POS_ORDER_MIGRATION_CLOSE_WAIT_MS): Promise<RxCollection<PosOrder>> {
  // The reset below runs before RxDB elects which tab migrates, so a second tab could reset a
  // migration another tab is running. TallyUI is single-instance (ADR-061).
  if (db.multiInstance) throw new Error('addPosOrderCollection: multiInstance databases are not supported (ADR-061)');
  // RxDB 17.5.0 sets the private `closePromise` as `close()` begins (rx-database.js:447), and that
  // close may already have read `db.onClose` (:473-476), so it would not wait for this open.
  if (db.closed || (db as unknown as { closePromise: unknown }).closePromise) throw new PosOrderOpenClosedError(db.name);
  // Registered before the first await. RxDB's close reads `db.onClose` once, when the database is
  // idle (rx-database.js:473-476), and creating or removing a store doesn't keep it busy: a handler
  // added after an await missed that close, which then closed storage under the open (2026-09-27).
  const previous = latestOpens.get(db);
  if (!previous) {
    db.onClose.push(() => waitWithTimeout(latestOpens.get(db)!, closeWaitMs)
      .then((settled) => { if (!settled) closedUnderOpen.add(db); }));
  }
  const opening = openPosOrders(db, previous);
  latestOpens.set(db, Promise.all([previous, opening.catch(() => undefined)]));
  return opening;
}

async function openPosOrders(db: RxDatabase, previous: Promise<unknown> | undefined): Promise<RxCollection<PosOrder>> {
  // Set once RxDB cancels this open's migration while it runs (see `startMigration` below).
  let cancelled = false;
  // The backstop, after each await: `closed` is set only once every store is closed (rx-database.js:444).
  const closing = () => cancelled || closedUnderOpen.has(db) || db.closed;
  const stopIfClosing = () => { if (closing()) throw new PosOrderOpenClosedError(db.name); };
  const { pos_orders: collection } = await db.addCollections({ pos_orders: { ...posOrderCollection(), autoMigrate: false } });
  const state = collection.getMigrationState();
  try {
    stopIfClosing();
    const mustMigrate = await state.mustMigrate;
    stopIfClosing();
    if (!mustMigrate) {
      // RxDB 17 blocks writes (COL25) from collection creation until its own `migrationNeeded()` read.
      // With nothing to migrate, `startMigration()` sets and clears that block on the same memoised `mustMigrate`,
      // as `migratePromise()` does for `autoMigrate` (rx-collection.js:939-941), so the open resolves only once writes are allowed.
      await state.startMigration();
      stopIfClosing();
      return collection;
    }
    // Never reset a still-settling earlier attempt's checkpoint out from under it: each new
    // migration on this database starts only once the one before it has fully settled.
    await previous;
    stopIfClosing();
    // Older-version orders exist (their collection record is there), so any stored status is a past run's.
    await state.updateStatus((status) => {
      // RxDB writes only what the handler changes in place.
      delete status.error;
      status.status = 'RUNNING';
      status.count = { total: 0, handled: 0, percent: 0 };
      return status;
    });
    // RxDB bug 1, which still reproduces on 17.5.0 (repro 2026-09-29):
    // A failed run leaves its checkpoint, which can be past an order it never copied (a queued
    // batch that finds its docs taken by a failed one still stores its checkpoint). The next run
    // would skip that order, then remove its storage. So every run starts from the first order,
    // as RxDB's own first run does; an order already copied is found equal and skipped.
    const old = (await state.oldCollectionMeta)!.data.schema;
    stopIfClosing();
    const checkpoint = await db.storage.createStorageInstance({ databaseName: db.name, collectionName: `rx-migration-state-meta-pos_orders-${old.version}`,
      databaseInstanceToken: db.token, multiInstance: db.multiInstance, options: {}, password: db.password,
      schema: getRxReplicationMetaInstanceSchema(old, hasEncryption(old)), devMode: overwritable.isDevMode() });
    await (closing() ? checkpoint.close() : checkpoint.remove());
    stopIfClosing();
    // RxDB bug 2, which still reproduces on 17.5.0 (repro 2026-09-29: a batch in flight when `cancel()`
    // is called lands after it resolves, 200 of 600 documents): a run's replication can outlive the
    // run. It wakes only on the stored older version's change stream (one
    // shared across instances, as on memory storage), then writes its checkpoint into the store a later
    // run removed (an unhandled `removed already`) and its conflicts into the older version. So that
    // stream ends once the run has settled. And RxDB never overwrites a copy in the current version (it
    // drops the assumed state): a stale copy wins its conflict. 17.5.0 keeps the copy and ignores the
    // conflict (rx-migration-state.js `masterWrite` returns none); 17.4.0 and 16.21 loop on it. Yet a copy is only
    // ever an earlier older-version state (the collection opens only once the older version is gone), so
    // the newer state goes first. A rare exception: after a rollback, an older build's one-time carry-over
    // (for example medusapos's Dexie import, run again from a leftover Dexie database, after a failed
    // removal or from an old tab) can bulk-insert an older state of order A into an empty older version
    // while the current version holds A as sent. This overwrite then makes A pending again, and it is sent
    // twice; the server's commandId idempotency is what stops a double charge. Also, a deleted
    // older-version order that has a copy is skipped in writeOverStaleCopies, so if anything ever
    // deleted a pos_orders document, its stale copy would win (17.5.0) or RxDB would loop on it (earlier).
    const settled = new Subject<void>();
    // Once the close stops waiting it closes this version's store and the internal store while RxDB's
    // migration runs on (rx-database.js:476-485). A write called on a closed SQLite instance throws
    // inside its transaction and poisons every later write on the handle until restart (rxdb-premium
    // bug 6, which still reproduces on 17.5.0, repro 2026-09-29), while its close waits for a write called before it (sqlite-storage-instance.js `close`,
    // openWriteCount$; reproduced). So from the moment the close gives up, before it closes any store,
    // the run's reads and writes of those two stores stop here. A refused one of this version rejects
    // the run's push, which RxDB catches as a replication error (upstream.js:372), so the run ends in
    // ERROR. Status writes are dropped instead: RxDB never awaits the per-order ones
    // (rx-migration-state.js:357-362), so a rejection there would be unhandled.
    // Every call a gate lets through that returns a promise is counted until it settles, so a cancelled
    // open (below) settles only once none of the run's calls can still reach a store the close closes.
    let inFlight = 0;
    let drained: (() => void) | undefined;
    const track = (result: unknown) => {
      if (!(result instanceof Promise)) return result;
      inFlight++;
      return result.finally(() => { if (--inFlight === 0) drained?.(); });
    };
    const gate = <T extends object>(target: T, closed: (key: 'bulkWrite' | 'findDocumentsById', first: any[]) => Promise<unknown>): T =>
      new Proxy(target, { get: (t, key) => {
        const value = Reflect.get(t, key);
        return typeof value !== 'function' ? value : (...args: any[]) =>
          (closing() && (key === 'bulkWrite' || key === 'findDocumentsById') ? closed(key, args[0]) : track(value.apply(t, args)));
      } });
    const internalStore = gate(db.internalStore, async (key, first) => {
      const ids = key === 'bulkWrite' ? first.map((row: { document: { id: string } }) => row.document.id) : first;
      posOrdersLogger.warn(`The database closed during the migration: dropped a ${key === 'bulkWrite' ? 'status write' : 'status read'}`,
        { database: db.name, ids });
      return key === 'bulkWrite' ? { error: [] } : [];
    });
    state.database = new Proxy(db, { get: (target, key) => (key === 'internalStore' ? internalStore : Reflect.get(target, key)) });
    const migrateStorage = state.migrateStorage.bind(state);
    state.migrateStorage = async (from, current, batchSize) => {
      stopIfClosing();
      // RxDB 17.5 sets `canceled` but never reads it, so a cancelled run would otherwise still
      // create a checkpoint store and a replication after `cancel()` returned.
      const to = gate(current, () => Promise.reject(new PosOrderOpenClosedError(db.name)));
      if (from.collectionName === collection.name) await writeOverStaleCopies(collection, from, to, stopIfClosing);
      stopIfClosing();
      return migrateStorage(new Proxy(from, { get: (target, key) => {
        const value = key === 'changeStream' ? () => target.changeStream().pipe(takeUntil(settled)) : Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      } }), to, batchSize);
    };
    // RxDB 17.5 hooks the database's and the collection's close to `cancel()` once the run starts
    // (rx-migration-state.js `startMigration`), and a cancelled run stops for good: its
    // `startMigration()` never settles. So a cancel while the run is pending settles the open:
    // `cancelled` first makes the gates above refuse the run's later reads and writes, the open waits
    // for the calls they already let through (a batch in flight still lands after `cancel()`, bug 2,
    // and one landing on a store the close has closed would poison the handle, bug 6), then it
    // rejects with `PosOrderOpenClosedError`. That covers the `db.onClose` path: the close's own
    // handler waits for the open (up to its limit, so a give-up never hangs) before it closes storage;
    // `cancel()`'s return does not wait for the drain. A cancel after the run has settled (the catch
    // below closes the collection) changes nothing.
    // This assumes 17.5's `cancel()` comes only from the close hooks. RxDB 16.x also calls it at the
    // end of a successful run, while `running` is still true: the gates would then drop its last
    // writes and pos_orders would never open. The wrapper depends on 17.5's `cancel()` and `startMigration()`
    // behaviour, which changed within a minor release before, so @tallyui/pos requires rxdb ~17.5.0.
    let running = true;
    let onCancel!: () => void;
    const cancelledRun = new Promise<void>((resolve) => { onCancel = resolve; });
    const cancel = state.cancel.bind(state);
    state.cancel = () => {
      if (running) {
        cancelled = true;
        if (inFlight === 0) onCancel();
        else drained = onCancel;
      }
      return cancel();
    };
    // Settles once the migration has: DONE, ERROR with its old storage closed, or cancelled by a close.
    await Promise.race([state.startMigration(), cancelledRun]).finally(() => { running = false; settled.next(); });
    stopIfClosing();
    const status = (await getSingleDocument(db.internalStore, state.statusDocId))?.data as RxMigrationStatus | undefined;
    stopIfClosing();
    // RxDB deletes the older version's collection record only after every order has moved.
    const oldMeta = status?.status === 'DONE' ? await getOldCollectionMeta(state) : undefined;
    stopIfClosing();
    if (status?.status === 'DONE' && !oldMeta) return collection;
    throw newRxError('DM4', { collection: collection.name, error: status?.error });
  } catch (error) {
    await collection.close();
    // A backstop: a read of a store the close has closed fails on SQLite with rxdb-premium bug 5's (still on 17.5.0) raw
    // `ReferenceError: context is not defined`. The internal store's reads are locked runs, which the
    // close's idle waits cover (rx-storage-helper.js:486), and no test reaches this; but once the close
    // has given up, any failure means the open was closed under, so it gets the coded error.
    throw closing() ? new PosOrderOpenClosedError(db.name) : error;
  }
}

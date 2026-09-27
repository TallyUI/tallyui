import {
  deepEqual, defaultConflictHandler, getChangedDocumentsSince, getRxReplicationMetaInstanceSchema, getSingleDocument, hasEncryption, newRxError,
  overwritable, rxStorageInstanceToReplicationHandler, type RxCollection, type RxDatabase, type RxStorageInstance,
} from 'rxdb';
import { getOldCollectionMeta, migrateDocumentData, type RxMigrationStatus } from 'rxdb/plugins/migration-schema';
import { Subject, takeUntil } from 'rxjs';
import { posOrderCollection } from './schema';
import type { PosOrder } from './types';

/**
 * After this long waiting for a stuck migration, a close gives up rather than hang forever. The
 * migration is left running: the next open finds the leftover status, resets it and the
 * checkpoint (as any DM4 does), and migrates again. An order that run already copied is found
 * equal and skipped, so the worst case is an `ERROR` status on the next open, never a lost order.
 */
export const POS_ORDER_MIGRATION_CLOSE_WAIT_MS = 10_000;

/**
 * `addPosOrderCollection` stopped, before any further write, because its database is closing: it
 * was called once `close()` had begun, or the close stopped waiting for it (after
 * `POS_ORDER_MIGRATION_CLOSE_WAIT_MS`). No order is lost: reopen the database and call it again.
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
 * one) to the migration. `from` is whichever older version is stored, 0 or 1.
 */
async function writeOverStaleCopies(collection: RxCollection, from: RxStorageInstance<any, any, any>, to: RxStorageInstance<any, any, any>) {
  const handler = rxStorageInstanceToReplicationHandler(to, defaultConflictHandler, collection.database.token, true);
  for (let page = await getChangedDocumentsSince(from, 200); page.documents.length > 0;
    page = await getChangedDocumentsSince(from, 200, page.checkpoint)) {
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
 * RxDB 16.21 trusts the status its last migration stored: a leftover `ERROR` rejects
 * `migratePromise` at once while the migration keeps running (a close then interrupts it), and a
 * `DONE` left before a rollback resolves it before the older version's new orders have moved. So the
 * collection is added without `autoMigrate`, the status and a failed run's checkpoint are reset
 * (never an order or its storage), and the migration itself is awaited.
 *
 * A close waits for the whole open, up to `POS_ORDER_MIGRATION_CLOSE_WAIT_MS`. Called once the
 * database's close has begun, or when the close stops waiting, it rejects with
 * `PosOrderOpenClosedError` (`code: 'POS_ORDER_OPEN_CLOSED'`) before any further write: reopen and
 * call it again. Any other rejection (DM4, a storage error) is a real failure.
 */
export async function addPosOrderCollection(db: RxDatabase): Promise<RxCollection<PosOrder>> {
  // The reset below runs before RxDB elects which tab migrates, so a second tab could reset a
  // migration another tab is running. TallyUI is single-instance (ADR-061).
  if (db.multiInstance) throw new Error('addPosOrderCollection: multiInstance databases are not supported (ADR-061)');
  // RxDB 16.21.1 sets the private `closePromise` as `close()` begins (rx-database.js:356), and that
  // close may already have read `db.onClose` (:381), so it would not wait for this open.
  if (db.closed || (db as unknown as { closePromise: unknown }).closePromise) throw new PosOrderOpenClosedError(db.name);
  // Registered before the first await. RxDB's close reads `db.onClose` once, when the database is
  // idle (rx-database.js:381), and creating or removing a store doesn't keep it busy: a handler
  // added after an await missed that close, which then closed storage under the open (2026-09-27).
  const previous = latestOpens.get(db);
  if (!previous) {
    db.onClose.push(() => waitWithTimeout(latestOpens.get(db)!, POS_ORDER_MIGRATION_CLOSE_WAIT_MS)
      .then((settled) => { if (!settled) closedUnderOpen.add(db); }));
  }
  const opening = openPosOrders(db, previous);
  latestOpens.set(db, Promise.all([previous, opening.catch(() => undefined)]));
  return opening;
}

async function openPosOrders(db: RxDatabase, previous: Promise<unknown> | undefined): Promise<RxCollection<PosOrder>> {
  // The backstop, after each await: `closed` is set only once every store is closed (rx-database.js:353).
  const closing = () => closedUnderOpen.has(db) || db.closed;
  const stopIfClosing = () => { if (closing()) throw new PosOrderOpenClosedError(db.name); };
  const { pos_orders: collection } = await db.addCollections({ pos_orders: { ...posOrderCollection(), autoMigrate: false } });
  const state = collection.getMigrationState();
  try {
    stopIfClosing();
    const mustMigrate = await state.mustMigrate;
    stopIfClosing();
    if (!mustMigrate) return collection;
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
    // RxDB bug 2: `cancel()` stops `this.replicationState`, which `migrateStorage` never sets, so each
    // run's replication outlives the run. It wakes only on the stored older version's change stream (one
    // shared across instances, as on memory storage), then writes its checkpoint into the store a later
    // run removed (an unhandled `removed already`) and its conflicts into the older version. So that
    // stream ends once the run has settled. And RxDB never overwrites a copy in the current version (it
    // drops the assumed state): a stale copy wins its conflict, or 16.21 loops on it. Yet a copy is only
    // ever an earlier older-version state (the collection opens only once the older version is gone), so
    // the newer state goes first. A rare exception: after a rollback, an older build's one-time carry-over
    // (for example medusapos's Dexie import, run again from a leftover Dexie database, after a failed
    // removal or from an old tab) can bulk-insert an older state of order A into an empty older version
    // while the current version holds A as sent. This overwrite then makes A pending again, and it is sent
    // twice; the server's commandId idempotency is what stops a double charge. Also, a deleted
    // older-version order that has a copy is skipped in writeOverStaleCopies, so RxDB would still
    // loop on it if anything ever deleted a pos_orders document.
    const settled = new Subject<void>();
    const migrateStorage = state.migrateStorage.bind(state);
    state.migrateStorage = async (from, to, batchSize) => {
      if (from.collectionName === collection.name) await writeOverStaleCopies(collection, from, to);
      return migrateStorage(new Proxy(from, { get: (target, key) => {
        const value = key === 'changeStream' ? () => target.changeStream().pipe(takeUntil(settled)) : Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      } }), to, batchSize);
    };
    // Settles once the migration has: DONE, or ERROR with its old storage closed. RxDB's close
    // does not stop a migration, so a close waits for it rather than closing storage under it.
    await state.startMigration().finally(() => settled.next());
    stopIfClosing();
    const status = (await getSingleDocument(db.internalStore, state.statusDocId))?.data as RxMigrationStatus | undefined;
    // RxDB deletes the older version's collection record only after every order has moved.
    if (status?.status === 'DONE' && !(await getOldCollectionMeta(state))) return collection;
    throw newRxError('DM4', { collection: collection.name, error: status?.error });
  } catch (error) {
    await collection.close();
    throw error;
  }
}

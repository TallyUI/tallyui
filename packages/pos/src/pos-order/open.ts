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

/** The latest migration per database, so a close waits for the current one across DM4 retries
 * rather than accumulating one wait per retry. Never loses track of an earlier attempt: each new
 * migration on a database starts only once the previous one has settled (see below). */
const latestMigrations = new WeakMap<RxDatabase, Promise<unknown>>();

function waitWithTimeout(promise: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    promise.finally(() => { clearTimeout(timer); resolve(); });
  });
}

/**
 * Writes each version-0 order over its differing version-1 copy, through the same write RxDB's
 * migration makes, and leaves orders without a copy (and any deleted one) to the migration.
 */
async function writeOverStaleCopies(collection: RxCollection, from: RxStorageInstance<any, any, any>, to: RxStorageInstance<any, any, any>) {
  const handler = rxStorageInstanceToReplicationHandler(to, defaultConflictHandler, collection.database.token, true);
  for (let page = await getChangedDocumentsSince(from, 200); page.documents.length > 0;
    page = await getChangedDocumentsSince(from, 200, page.checkpoint)) {
    const copies = new Map((await to.findDocumentsById(page.documents.map((doc) => doc.id), false)).map((copy) => [copy.id, copy]));
    const rows = await Promise.all(page.documents.filter((doc) => copies.has(doc.id) && !doc._deleted).map(async (doc) =>
      ({ assumedMasterState: copies.get(doc.id), newDocumentState: await migrateDocumentData(collection, from.schema.version, doc) })));
    const stale = rows.filter((row) => row.newDocumentState && !deepEqual(row.assumedMasterState, row.newDocumentState));
    // A write error (a version-0 state version 1 refuses) stops the run with DM4, as RxDB's own write does.
    if (stale.length > 0) await handler.masterWrite(stale);
  }
}

/**
 * Adds `pos_orders` to `db` and resolves once no version-0 order is left to migrate. The one
 * sanctioned way to open it (ADR-032 amendment 2). On DM4 it rejects after the migration has
 * stopped and closes the collection, so the app can surface the error and open again; it never
 * deletes an order.
 *
 * RxDB 16.21 trusts the status its last migration stored: a leftover `ERROR` rejects
 * `migratePromise` at once while the migration keeps running (a close then interrupts it), and a
 * `DONE` left before a rollback resolves it before the new version-0 orders have moved. So the
 * collection is added without `autoMigrate`, the status and a failed run's checkpoint are reset
 * (never an order or its storage), and the migration itself is awaited.
 */
export async function addPosOrderCollection(db: RxDatabase): Promise<RxCollection<PosOrder>> {
  // The reset below runs before RxDB elects which tab migrates, so a second tab could reset a
  // migration another tab is running. TallyUI is single-instance (ADR-061).
  if (db.multiInstance) throw new Error('addPosOrderCollection: multiInstance databases are not supported (ADR-061)');
  const { pos_orders: collection } = await db.addCollections({ pos_orders: { ...posOrderCollection(), autoMigrate: false } });
  const state = collection.getMigrationState();
  try {
    if (!(await state.mustMigrate)) return collection;
    // Never reset a still-settling earlier attempt's checkpoint out from under it: each new
    // migration on this database starts only once the one before it has fully settled.
    await latestMigrations.get(db);
    // Version-0 orders exist (their collection record is there), so any stored status is a past run's.
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
    await (await db.storage.createStorageInstance({ databaseName: db.name, collectionName: `rx-migration-state-meta-pos_orders-${old.version}`,
      databaseInstanceToken: db.token, multiInstance: db.multiInstance, options: {}, password: db.password,
      schema: getRxReplicationMetaInstanceSchema(old, hasEncryption(old)), devMode: overwritable.isDevMode() })).remove();
    // RxDB bug 2: `cancel()` stops `this.replicationState`, which `migrateStorage` never sets, so each
    // run's replication outlives the run. It wakes only on its version-0 change stream (one shared
    // across instances, as on memory storage), then writes its checkpoint into the store a later run
    // removed (an unhandled `removed already`) and its conflicts into version 0. So that stream ends
    // once the run has settled. And RxDB never overwrites a version-1 copy (it drops the assumed
    // state): a stale copy wins its conflict, or 16.21 loops on it. Yet a copy is only ever an earlier
    // version-0 state (the collection opens only once version 0 is gone), so the newer state goes first.
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
    const migration = state.startMigration().finally(() => settled.next());
    const isFirstMigrationOnDb = !latestMigrations.has(db);
    latestMigrations.set(db, migration.catch(() => undefined));
    if (isFirstMigrationOnDb) db.onClose.push(() => waitWithTimeout(latestMigrations.get(db)!, POS_ORDER_MIGRATION_CLOSE_WAIT_MS));
    await migration;
    const status = (await getSingleDocument(db.internalStore, state.statusDocId))?.data as RxMigrationStatus | undefined;
    // RxDB deletes the version-0 collection record only after every order has moved.
    if (status?.status === 'DONE' && !(await getOldCollectionMeta(state))) return collection;
    throw newRxError('DM4', { collection: collection.name, error: status?.error });
  } catch (error) {
    await collection.close();
    throw error;
  }
}

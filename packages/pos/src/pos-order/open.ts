import {
  getRxReplicationMetaInstanceSchema, getSingleDocument, hasEncryption, newRxError, overwritable, type RxCollection, type RxDatabase,
} from 'rxdb';
import { getOldCollectionMeta, type RxMigrationStatus } from 'rxdb/plugins/migration-schema';
import { posOrderCollection } from './schema';
import type { PosOrder } from './types';

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
  const { pos_orders: collection } = await db.addCollections({ pos_orders: { ...posOrderCollection(), autoMigrate: false } });
  const state = collection.getMigrationState();
  try {
    if (!(await state.mustMigrate)) return collection;
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
    // Settles once the migration has: DONE, or ERROR with its old storage closed. RxDB's close
    // does not stop a migration, so a close waits for it rather than closing storage under it.
    const migration = state.startMigration();
    db.onClose.push(() => migration.catch(() => undefined));
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

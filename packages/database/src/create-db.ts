import { createRxDatabase, addRxPlugin, type RxDatabase, type RxCollection } from 'rxdb';
import type { Observable } from 'rxjs';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';

import type { TallyConnector } from '@tallyui/core';

import { STOCK_LEVELS_COLLECTION, stockLevelsCollection } from './stock-levels';
import { WEB_STORAGE_ENGINE, REQUIRED_MULTI_INSTANCE_BY_ENGINE, assertMultiInstanceAllowed } from './engine';
import { withStorageWatchdog, type StorageHealth } from './storage-watchdog';

const DEV_MODE = process.env.NODE_ENV !== 'production';
addRxPlugin(RxDBLocalDocumentsPlugin);

// Enable dev mode in non-production
if (DEV_MODE) {
  addRxPlugin(RxDBDevModePlugin);
}

/**
 * The shape of a Tally database — keyed by collection name.
 */
export type TallyDatabase = RxDatabase<{
  [key: string]: RxCollection;
}>;

export interface CreateDatabaseOptions {
  /** The connector whose schemas define the collections */
  connector: TallyConnector;
  /** Database name (defaults to `tally_${connector.id}`) */
  name?: string;
  /** RxDB storage adapter (defaults to in-memory for dev/demo) */
  storage?: any;
  /** Share the database between browser tabs (default false).
   * With true, the order outbox sends only from the RxDB-elected leader tab. */
  multiInstance?: boolean;
}

/**
 * Create an RxDB database from a connector's schemas.
 *
 * This is the main entry point — give it a connector and it builds
 * the database with the right collections and schemas. A connector with
 * `reconcile.stock` also gets the `stock_levels` overlay collection.
 *
 * ```ts
 * import { woocommerceConnector } from '@tallyui/connector-woocommerce';
 * import { createTallyDatabase } from '@tallyui/database';
 *
 * const db = await createTallyDatabase({ connector: woocommerceConnector });
 * const products = await db.products.find().exec();
 * ```
 */
export async function createTallyDatabase(options: CreateDatabaseOptions): Promise<TallyDatabase> {
  const {
    connector,
    name = `tally_${connector.id}`,
    storage = getRxStorageMemory(),
    multiInstance = REQUIRED_MULTI_INSTANCE_BY_ENGINE[WEB_STORAGE_ENGINE],
  } = options;

  assertMultiInstanceAllowed(storage, multiInstance);
  // ADR-061's storage watchdog applies only to the pinned web engine; every other storage is untouched.
  const watched = storage?.tallyEngine === WEB_STORAGE_ENGINE ? withStorageWatchdog(storage) : undefined;
  const effectiveStorage = watched ?? storage;

  const collectionConfigs: Record<string, { schema: any; localDocuments?: boolean }> = {};
  for (const [collectionName, schema] of Object.entries(connector.schemas)) {
    collectionConfigs[collectionName] = { schema };
  }
  // The stock reconcile overlay (ADR-060): local only, never replicated. Its
  // local documents hold the time of the last successful pass.
  if (connector.reconcile?.stock) {
    if (STOCK_LEVELS_COLLECTION in collectionConfigs) {
      throw new Error(`Connector "${connector.id}" defines a "${STOCK_LEVELS_COLLECTION}" collection; that name is reserved for the stock reconcile overlay.`);
    }
    collectionConfigs[STOCK_LEVELS_COLLECTION] = stockLevelsCollection;
  }

  const db = await createRxDatabase({
    name,
    // Dev mode refuses storage without a schema validator (RxDB error DVM1),
    // and validating is what makes dev mode catch bad connector documents.
    storage: DEV_MODE ? wrappedValidateAjvStorage({ storage: effectiveStorage }) : effectiveStorage,
    multiInstance,
    localDocuments: multiInstance,
    // RxDB rejects this outside dev mode (DB9); in dev it lets hot reload re-create the same database.
    ignoreDuplicate: DEV_MODE,
  });

  if (watched) healthByDatabase.set(db, watched.health$);

  await db.addCollections(collectionConfigs);

  return db as TallyDatabase;
}

const healthByDatabase = new WeakMap<object, Observable<StorageHealth>>();

/**
 * The storage health of a database on the web engine (ADR-061), so an app can
 * show "saving is slow…" (`stalled`) or "storage stopped, reload" (`dead`).
 * `undefined` for any other storage, which has no watchdog.
 */
export function getStorageHealth(db: TallyDatabase): Observable<StorageHealth> | undefined {
  return healthByDatabase.get(db);
}

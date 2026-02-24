import { createRxDatabase, addRxPlugin, type RxDatabase, type RxCollection } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import type { TallyConnector } from '@tallyui/core';

// Enable dev mode in non-production
if (process.env.NODE_ENV !== 'production') {
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
}

/**
 * Create an RxDB database from a connector's schemas.
 *
 * This is the main entry point — give it a connector and it builds
 * the database with the right collections and schemas.
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
  } = options;

  const db = await createRxDatabase({
    name,
    storage,
    multiInstance: false,
    ignoreDuplicate: true,
  });

  // Build collection configs from connector schemas
  const collectionConfigs: Record<string, { schema: any }> = {};
  for (const [collectionName, schema] of Object.entries(connector.schemas)) {
    collectionConfigs[collectionName] = { schema };
  }

  await db.addCollections(collectionConfigs);

  return db as TallyDatabase;
}

// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createRxDatabase } from 'rxdb';
import { wooProductSchema } from '@tallyui/connector-woocommerce';
import { connectorCollection } from '@tallyui/database';
import { loadSQLiteStorage, openNodeSQLite } from '@tallyui/storage-sqlite/node-sqlite.test-helper';

const getRxStorageSQLite = await loadSQLiteStorage();
if (!getRxStorageSQLite && process.env.CI) {
  it('requires rxdb-premium in CI', () => { throw new Error('rxdb-premium is missing in CI'); });
}

/** The version 4 product schema: version 5 without featured. */
function previousProductSchema(): typeof wooProductSchema {
  const properties = { ...wooProductSchema.properties };
  delete properties.featured;
  return { ...wooProductSchema, version: 4, properties };
}

(getRxStorageSQLite ? describe : describe.skip)('WooCommerce product schema upgrade on SQLite storage', () => {
  let handle: ReturnType<typeof openNodeSQLite>;
  afterEach(() => { handle?.raw.close(); });

  it('drops a version 4 product cache on open under schema version 5 and resyncs it', async () => {
    // One SQLite handle: every open below reads and writes the same database.
    handle = openNodeSQLite();
    const open = async (schema: typeof wooProductSchema) => {
      const db = await createRxDatabase({ name: 'tally_woocommerce', storage: getRxStorageSQLite!(handle.database), multiInstance: false });
      await db.addCollections({ products: connectorCollection(schema) });
      return db;
    };
    let db = await open(previousProductSchema());
    await db.products.insert({ uuid: 'stale', id: 999, name: 'Stale', status: 'publish', date_modified_gmt: '2026-01-01T00:00:00' });
    expect(await db.products.count().exec()).toBe(1);
    await db.close();

    db = await open(wooProductSchema);
    expect(db.products.schema.version).toBe(5);
    expect(await db.products.count().exec()).toBe(0);
    await db.products.insert({ uuid: 'fresh', id: 1, name: 'Fresh', status: 'publish', low_stock_amount: 3 });
    await db.close();

    // A reopen at the same version drops nothing.
    db = await open(wooProductSchema);
    expect((await db.products.findOne('fresh').exec())?.toJSON()).toMatchObject({ uuid: 'fresh', low_stock_amount: 3 });
    await db.close();
  });
});

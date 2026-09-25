// @vitest-environment node
// Read-only: changes nothing on the server.
import { afterEach, describe, expect, it } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { STOCK_LEVELS_COLLECTION, startStockReconcile, stockLevelsCollection } from '@tallyui/database';
import { getProductStock } from '@tallyui/pos';
import { medusaAdminUserAuth, medusaAdminUserConnector } from '@tallyui/connector-medusa';

addRxPlugin(RxDBDevModePlugin);

const { MEDUSA_DEV_URL, MEDUSA_DEV_EMAIL, MEDUSA_DEV_PASSWORD } = process.env;

describe.skipIf(!MEDUSA_DEV_URL || !MEDUSA_DEV_EMAIL || !MEDUSA_DEV_PASSWORD)('live Medusa stock reconcile', () => {
  let db: RxDatabase;

  afterEach(async () => {
    await db?.close();
  });

  it('reads every inventory page into stock_levels and agrees with fresh copies', async () => {
    const baseUrl = MEDUSA_DEV_URL!;
    const signIn = await fetch(`${baseUrl}/auth/user/emailpass`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: MEDUSA_DEV_EMAIL, password: MEDUSA_DEV_PASSWORD }),
    });
    expect(signIn.ok).toBe(true);
    const { token } = await signIn.json();
    expect(token).toBeTruthy();
    const context = { connectorId: 'medusa', baseUrl, headers: medusaAdminUserAuth.getHeaders({ token }) };

    db = await createRxDatabase({
      name: 'medusastocklive', multiInstance: false,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    });
    await db.addCollections({ [STOCK_LEVELS_COLLECTION]: stockLevelsCollection });
    const { documents } = await medusaAdminUserConnector.replication!.products!.pull.handler(undefined, 50, context);
    expect(documents.length).toBeGreaterThan(0);

    const head = await fetch(`${baseUrl}/admin/inventory-items?limit=1&fields=id`, { headers: context.headers });
    expect(head.ok).toBe(true);
    const { count } = await head.json();

    const adapter = medusaAdminUserConnector.reconcile!.stock!;
    const traits = medusaAdminUserConnector.traits.product;
    const reconcile = startStockReconcile({ collection: db[STOCK_LEVELS_COLLECTION], adapter, context });
    try {
      const first = await reconcile.reconcileStock();
      expect(first).toMatchObject({ pages: Math.ceil(count / 1000), truncated: false });
      expect(first.written).toBeGreaterThan(0);
      expect(await reconcile.reconcileStock()).toMatchObject({ written: 0, removed: 0, truncated: false });
      // Freshly fetched products already carry current stock, so the overlay agrees with them.
      const overlay = new Map((await db[STOCK_LEVELS_COLLECTION].find().exec()).map((row) => [row.primary, row.get('value')]));
      for (const { _deleted, ...doc } of documents) {
        expect(getProductStock(doc, traits, adapter, overlay)).toEqual(traits.getStock(doc));
      }
    } finally {
      reconcile.stop();
    }
  }, 120000);
});

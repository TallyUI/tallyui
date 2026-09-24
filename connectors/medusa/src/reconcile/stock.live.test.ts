// @vitest-environment node
// Read-only: changes nothing on the server.
import { afterEach, describe, expect, it } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { startStockReconcile } from '@tallyui/database';
import { medusaAdminUserAuth, medusaAdminUserConnector } from '../index';
import { medusaProductSchema } from '../schemas/products';

addRxPlugin(RxDBDevModePlugin);

const { MEDUSA_DEV_URL, MEDUSA_DEV_EMAIL, MEDUSA_DEV_PASSWORD } = process.env;

describe.skipIf(!MEDUSA_DEV_URL || !MEDUSA_DEV_EMAIL || !MEDUSA_DEV_PASSWORD)('live Medusa stock reconcile', () => {
  let db: RxDatabase;

  afterEach(async () => {
    await db?.close();
  });

  it('reads every inventory page and patches nothing on fresh copies', async () => {
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
    await db.addCollections({ products: { schema: medusaProductSchema } });
    const { documents } = await medusaAdminUserConnector.replication!.products!.pull.handler(undefined, 50, context);
    expect(documents.length).toBeGreaterThan(0);
    await db.products.bulkInsert(documents.map(({ _deleted, ...doc }) => doc));

    const head = await fetch(`${baseUrl}/admin/inventory-items?limit=1&fields=id`, { headers: context.headers });
    expect(head.ok).toBe(true);
    const { count } = await head.json();

    const reconcile = startStockReconcile({ collection: db.products, adapter: medusaAdminUserConnector.reconcile!.stock!, context });
    try {
      expect(await reconcile.reconcileStock()).toEqual({ pages: Math.ceil(count / 1000), patched: 0, truncated: false });
    } finally {
      reconcile.stop();
    }
  }, 120000);
});

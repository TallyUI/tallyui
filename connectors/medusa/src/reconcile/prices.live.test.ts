// @vitest-environment node
// Read-only: changes nothing on the server.
import { describe, expect, it } from 'vitest';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { SyncContext } from '@tallyui/core';
import { startFingerprintReconcile } from '@tallyui/database';
import { medusaAdminUserAuth, medusaConnector, medusaProductSchema } from '../index';
import { fetchByIds } from './ids';

addRxPlugin(RxDBDevModePlugin);

const { MEDUSA_DEV_URL, MEDUSA_DEV_EMAIL, MEDUSA_DEV_PASSWORD } = process.env;

describe.skipIf(!MEDUSA_DEV_URL || !MEDUSA_DEV_EMAIL || !MEDUSA_DEV_PASSWORD)('live Medusa price reconcile', () => {
  it('finds no drift against documents just fetched with the replication\'s fields, reading ceil(count/1000) pages', async () => {
    const baseUrl = MEDUSA_DEV_URL!;
    const { token } = await medusaAdminUserAuth.signIn!(baseUrl, { email: MEDUSA_DEV_EMAIL!, password: MEDUSA_DEV_PASSWORD! });
    expect(token).toBeTruthy();
    const context: SyncContext = { connectorId: 'medusa', baseUrl, headers: medusaAdminUserAuth.getHeaders({ token }) };

    const countResponse = await fetch(`${baseUrl}/admin/product-variants?limit=1&fields=id`, { headers: context.headers });
    expect(countResponse.ok).toBe(true);
    const { count: totalCount } = await countResponse.json();

    // Every product id the price adapter reports, fetched fresh in the replication's document shape.
    const ids = new Set<string>();
    for await (const page of medusaConnector.reconcile!.prices!.fetchPages(context)) for (const productId of page.keys()) ids.add(productId);
    const docs = await fetchByIds([...ids], context);

    const db = await createRxDatabase({
      name: `medusa_price_live_${Date.now()}`, multiInstance: false,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    });
    await db.addCollections({ products: { schema: medusaProductSchema } });
    await db.products.bulkInsert(docs as Record<string, unknown>[]);

    const runner = startFingerprintReconcile({
      collection: db.products, adapter: medusaConnector.reconcile!.prices!, context, reSync: () => {},
    });
    const result = await runner.reconcile();
    expect(result.truncated).toBe(false);
    expect(result.pages).toBe(Math.ceil(totalCount / 1000));
    expect(result.queued).toBe(0);
    runner.stop();
    await db.close();
  }, 60000);
});

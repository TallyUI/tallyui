// @vitest-environment node
// Read-only: medusa-dev is shared, so this changes nothing on the server.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { replicateRxCollection } from 'rxdb/plugins/replication';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { connectorCollection } from '@tallyui/database';
import type { SyncContext } from '@tallyui/core';
import { medusaAdminUserAuth, medusaConnector, medusaProductSchema } from '../index';
import { medusaStoreSettings } from '../store-settings';
import { createMedusaVariantFeedReplication } from './variant-feed';

addRxPlugin(RxDBDevModePlugin);

const { MEDUSA_DEV_URL, MEDUSA_DEV_EMAIL, MEDUSA_DEV_PASSWORD } = process.env;

describe.skipIf(!MEDUSA_DEV_URL || !MEDUSA_DEV_EMAIL || !MEDUSA_DEV_PASSWORD)('live Medusa variant feed', () => {
  afterEach(() => vi.restoreAllMocks());

  it('filters variants on updated_at[$gte] and re-delivers only the changed variants\' parents', async () => {
    const baseUrl = MEDUSA_DEV_URL!;
    const { token } = await medusaAdminUserAuth.signIn!(baseUrl, { email: MEDUSA_DEV_EMAIL!, password: MEDUSA_DEV_PASSWORD! });
    const context: SyncContext = { connectorId: 'medusa', baseUrl, headers: medusaAdminUserAuth.getHeaders({ token }) };
    const get = async (path: string) => {
      const response = await fetch(`${baseUrl}${path}`, { headers: context.headers });
      expect(response.ok).toBe(true);
      return response.json();
    };
    const feed = createMedusaVariantFeedReplication();
    // Every request the feed sends, read through to the real server.
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const urls = () => fetchSpy.mock.calls.map(([input]) => new URL(String(input)));

    // A future mark: the variant route must honour the operator form, and the
    // feed fetches no parents. The mark moves back to the newest variant, so
    // the feed may return one carrier product to keep that checkpoint.
    const futureMark = '2099-01-01T00:00:00.000Z';
    expect((await get(`/admin/product-variants?${new URLSearchParams({ 'updated_at[$gte]': futureMark, limit: '1' })}`)).count).toBe(0);
    fetchSpy.mockClear();
    const future = await feed.pull.handler({ offset: 0, updated_at: futureMark }, 50, context);
    expect(urls().filter((url) => url.searchParams.getAll('id[]').length)).toEqual([]);
    expect(future.documents.length).toBeLessThanOrEqual(1);

    // 1 ms before the newest variant's updated_at: that variant's parent, not the whole catalogue.
    const { variants: [newest] } = await get('/admin/product-variants?limit=1&order=-updated_at&fields=id,updated_at,product_id');
    expect(newest).toBeDefined();
    const { count: totalProducts } = await get('/admin/products?limit=1&fields=id');
    const since = new Date(Date.parse(newest.updated_at) - 1).toISOString();
    const recent = await feed.pull.handler({ offset: 0, updated_at: since }, 50, context);
    expect(recent.documents.map((doc) => (doc as { id?: string }).id)).toContain(newest.product_id);
    expect(recent.documents.length).toBeLessThan(totalProducts);
  }, 60000);

  it('delivers each product once on a fresh-install first sync into a memory database', async () => {
    const baseUrl = MEDUSA_DEV_URL!;
    const { token } = await medusaAdminUserAuth.signIn!(baseUrl, { email: MEDUSA_DEV_EMAIL!, password: MEDUSA_DEV_PASSWORD! });
    const admin: SyncContext = { connectorId: 'medusa', baseUrl, headers: medusaAdminUserAuth.getHeaders({ token }) };
    // Priced as the app syncs (D2b), so the store API requests are counted too.
    const settings = await medusaStoreSettings(admin, { country: 'de' });
    const context: SyncContext = { ...admin, pricingContext: settings.pricingContext };
    const db = await createRxDatabase({
      name: `medusa_first_sync_live_${Date.now()}`, multiInstance: false,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    });
    await db.addCollections({ products: connectorCollection(medusaProductSchema) });

    // Count the first sync's requests and bytes by wrapping fetch.
    const realFetch = globalThis.fetch;
    let requests = 0;
    let bytes = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const response = await realFetch(input, init);
      requests++;
      bytes += (await response.clone().arrayBuffer()).byteLength;
      return response;
    });
    const adapter = medusaConnector.replication!.products!;
    const delivered: string[] = [];
    const errors: unknown[] = [];
    const started = performance.now();
    const replication = replicateRxCollection<any, any>({
      collection: db.products, replicationIdentifier: `medusa-first-sync-live-${Date.now()}`,
      live: true, waitForLeadership: false, retryTime: 1000,
      pull: {
        batchSize: 100,
        handler: async (checkpoint, batchSize) => {
          const result = await adapter.pull.handler(checkpoint, batchSize, context);
          delivered.push(...result.documents.map((doc) => (doc as { id: string }).id));
          return result;
        },
      },
    });
    replication.error$.subscribe((error) => errors.push(error));
    await replication.awaitInSync();
    const ms = Math.round(performance.now() - started);
    await replication.cancel();
    const unique = new Set(delivered).size;
    console.log(`fresh-install first sync: ${requests} requests, ${bytes} bytes, ${ms} ms, ${delivered.length} product documents delivered (${unique} distinct)`);
    expect(errors).toEqual([]);
    // medusa-dev is shared: an edit made during the run may deliver its product twice; rerun if so.
    expect(delivered.length).toBe(unique);
    expect(await db.products.count().exec()).toBe(unique);
    await db.close();
  }, 180000);
});

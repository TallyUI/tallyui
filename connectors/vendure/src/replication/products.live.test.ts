// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { replicateRxCollection, type RxReplicationState } from 'rxdb/plugins/replication';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { connectorCollection } from '@tallyui/database';
import { createVendureConnector, vendureGlobalStockSettings } from '../index';
import { vendureProductSchema } from '../schemas/products';
import type { VendureProductCheckpoint } from './products';

addRxPlugin(RxDBDevModePlugin);

describe.skipIf(!process.env.VENDURE_DEV_URL)('live Vendure product replication', () => {
  let db: RxDatabase;
  let replication: RxReplicationState<any, VendureProductCheckpoint>;

  afterEach(async () => {
    await replication?.cancel();
    await db?.close();
    vi.restoreAllMocks();
  });

  it('replicates all products, variant fields and a later rename without warnings', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const baseUrl = process.env.VENDURE_DEV_URL!;
    const endpoint = `${baseUrl}/admin-api`;
    const login = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `mutation Login($username: String!, $password: String!) {
          login(username: $username, password: $password) { __typename }
        }`,
        variables: {
          username: process.env.VENDURE_DEV_USER ?? 'superadmin',
          password: process.env.VENDURE_DEV_PASSWORD ?? 'superadmin',
        },
      }),
    });
    expect(login.ok).toBe(true);
    expect((await login.json()).data?.login.__typename).toBe('CurrentUser');
    const token = login.headers.get('vendure-auth-token');
    expect(token).toBeTruthy();
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const response = await fetch(endpoint, {
      method: 'POST', headers,
      body: JSON.stringify({ query: `{
        products(options: { take: 1 }) { totalItems items { id name languageCode } }
      }` }),
    });
    expect(response.ok).toBe(true);
    const body = await response.json();
    expect(body.errors).toBeUndefined();
    const { totalItems, items: [product] } = body.data.products;
    expect(totalItems).toBeGreaterThan(0);
    db = await createRxDatabase({
      name: 'vendurelive', multiInstance: false,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    });
    await db.addCollections({ products: connectorCollection(vendureProductSchema) });
    const adapter = createVendureConnector({ barcodeField: 'barcode' }).replication!.products!;
    const options = {
      collection: db.products, replicationIdentifier: 'vendure-products-live',
      live: false, waitForLeadership: false,
      pull: {
        batchSize: 100,
        handler: (checkpoint: VendureProductCheckpoint | undefined, batchSize: number) =>
          adapter.pull.handler(checkpoint, batchSize, { connectorId: 'vendure', baseUrl, headers }),
      },
    };
    replication = replicateRxCollection<any, VendureProductCheckpoint>(options);
    await replication.awaitInitialReplication();
    const local = await db.products.find().exec();
    expect(local).toHaveLength(totalItems);
    const variants = local.flatMap((p) => p.toJSON().variants);
    for (const variant of variants) expect(Array.isArray(variant.stockLevels)).toBe(true);
    expect(variants.some((variant) => Boolean(variant.customFields?.barcode))).toBe(true);
    // backlog 28: trackInventory, the threshold fields and enabled ride on every variant.
    for (const variant of variants) {
      expect(['TRUE', 'FALSE', 'INHERIT']).toContain(variant.trackInventory);
      expect(typeof variant.outOfStockThreshold).toBe('number');
      expect(typeof variant.useGlobalOutOfStockThreshold).toBe('boolean');
      expect(typeof variant.enabled).toBe('boolean');
    }
    const globalStock = await vendureGlobalStockSettings({ connectorId: 'vendure', baseUrl, headers });
    expect(typeof globalStock.trackInventory).toBe('boolean');
    expect(typeof globalStock.outOfStockThreshold).toBe('number');
    expect(warn).not.toHaveBeenCalled();
    await replication.cancel();

    const name = `${product.name} (live replication test)`;
    const query = `mutation Rename($input: UpdateProductInput!) {
      updateProduct(input: $input) { id name }
    }`;
    try {
      const updated = await fetch(endpoint, {
        method: 'POST', headers,
        body: JSON.stringify({ query, variables: { input: {
          id: product.id, translations: [{ languageCode: product.languageCode, name }],
        } } }),
      });
      expect(updated.ok).toBe(true);
      const result = await updated.json();
      expect(result.errors).toBeUndefined();
      expect(result.data.updateProduct.name).toBe(name);
      replication = replicateRxCollection<any, VendureProductCheckpoint>(options);
      await replication.awaitInitialReplication();
      expect((await db.products.findOne(product.id).exec())?.name).toBe(name);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      const restored = await fetch(endpoint, {
        method: 'POST', headers,
        body: JSON.stringify({ query, variables: { input: {
          id: product.id, translations: [{ languageCode: product.languageCode, name: product.name }],
        } } }),
      });
      expect(restored.ok).toBe(true);
      const result = await restored.json();
      expect(result.errors).toBeUndefined();
      expect(result.data.updateProduct.name).toBe(product.name);
    }
  }, 120000);
});

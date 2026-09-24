// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { replicateRxCollection, type RxReplicationState } from 'rxdb/plugins/replication';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { ReplicationAdapter } from '@tallyui/core';
import { createVendureConnector } from '../index';
import { vendureProductSchema } from '../schemas/products';
import { createVendureProductReplication } from './products';

addRxPlugin(RxDBDevModePlugin);

describe.skipIf(!process.env.VENDURE_DEV_URL)('live Vendure variant feed', () => {
  let db: RxDatabase;
  let replication: RxReplicationState<any, any> | undefined;

  afterEach(async () => {
    await replication?.cancel();
    await db?.close();
    vi.restoreAllMocks();
  });

  it('delivers a variant price change that the product feed misses', async () => {
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
    const token = login.headers.get('vendure-auth-token');
    expect(token).toBeTruthy();
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const admin = async (query: string, variables?: Record<string, unknown>) => {
      const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
      expect(response.ok).toBe(true);
      const body = await response.json();
      expect(body.errors).toBeUndefined();
      return body.data;
    };
    const { productVariants: { items: [variant] } } = await admin(`{
      productVariants(options: { take: 1 }) { items { id price productId } }
    }`);
    expect(variant).toBeDefined();

    db = await createRxDatabase({
      name: 'vendurevariantfeedlive', multiInstance: false,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    });
    await db.addCollections({ products: { schema: vendureProductSchema } });
    // The product feed alone, to show it misses the change, and the connector's one replication.
    const feeds: Record<string, ReplicationAdapter<any>> = {
      productFeed: createVendureProductReplication('barcode'),
      products: createVendureConnector({ barcodeField: 'barcode' }).replication!.products!,
    };
    const run = async (feed: 'productFeed' | 'products') => {
      replication = replicateRxCollection<any, any>({
        collection: db.products, replicationIdentifier: `vendure-${feed}-live`,
        live: false, waitForLeadership: false,
        pull: {
          batchSize: 100,
          handler: (checkpoint, batchSize) =>
            feeds[feed].pull.handler(checkpoint, batchSize, { connectorId: 'vendure', baseUrl, headers }),
        },
      });
      await replication.awaitInitialReplication();
      await replication.cancel();
      const parent = await db.products.findOne(String(variant.productId)).exec();
      return parent!.toJSON().variants.find((v: any) => v.id === variant.id)?.price;
    };
    const setPrice = (price: number) => admin(`mutation SetPrice($input: [UpdateProductVariantInput!]!) {
      updateProductVariants(input: $input) { id price }
    }`, { input: [{ id: variant.id, price }] });

    expect(await run('productFeed')).toBe(variant.price);
    expect(await run('products')).toBe(variant.price);
    try {
      await setPrice(variant.price + 1);
      expect(await run('productFeed')).toBe(variant.price);
      expect(await run('products')).toBe(variant.price + 1);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      const [restored] = (await setPrice(variant.price)).updateProductVariants;
      expect(restored.price).toBe(variant.price);
    }
  }, 120000);
});

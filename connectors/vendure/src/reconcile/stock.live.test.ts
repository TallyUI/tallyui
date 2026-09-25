// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { replicateRxCollection } from 'rxdb/plugins/replication';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { STOCK_LEVELS_COLLECTION, connectorCollection, startStockReconcile, stockLevelsCollection } from '@tallyui/database';
import { getProductStock } from '@tallyui/pos';
import { createVendureConnector } from '../index';
import { vendureProductSchema } from '../schemas/products';
import type { VendureProductCheckpoint } from '../replication/products';

addRxPlugin(RxDBDevModePlugin);

describe.skipIf(!process.env.VENDURE_DEV_URL)('live Vendure stock reconcile', () => {
  let db: RxDatabase;

  afterEach(async () => {
    await db?.close();
  });

  it('overlays a stock change that replication does not see, leaving the product untouched', async () => {
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
    const context = { connectorId: 'vendure', baseUrl, headers };

    db = await createRxDatabase({
      name: 'vendurestocklive', multiInstance: false,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    });
    await db.addCollections({
      products: connectorCollection(vendureProductSchema),
      [STOCK_LEVELS_COLLECTION]: stockLevelsCollection,
    });
    const connector = createVendureConnector();
    const adapter = connector.replication!.products!;
    const replication = replicateRxCollection<any, VendureProductCheckpoint>({
      collection: db.products, replicationIdentifier: 'vendure-stock-live',
      live: false, waitForLeadership: false,
      pull: { batchSize: 100, handler: (checkpoint, batchSize) => adapter.pull.handler(checkpoint, batchSize, context) },
    });
    await replication.awaitInitialReplication();
    await replication.cancel();

    const product = (await db.products.find().exec()).map((d) => d.toJSON() as any)
      .find((p) => p.variants?.some((v: any) => v.stockLevels?.length));
    expect(product).toBeDefined();
    const variant = product.variants.find((v: any) => v.stockLevels?.length);
    const { stockLocationId, stockOnHand } = variant.stockLevels[0];
    const setStock = async (value: number) => {
      const res = await fetch(endpoint, {
        method: 'POST', headers,
        body: JSON.stringify({
          query: `mutation SetStock($input: [UpdateProductVariantInput!]!) {
            updateProductVariants(input: $input) { id stockLevels { stockLocationId stockOnHand } }
          }`,
          variables: { input: [{ id: variant.id, stockLevels: [{ stockLocationId, stockOnHand: value }] }] },
        }),
      });
      expect(res.ok).toBe(true);
      const body = await res.json();
      expect(body.errors).toBeUndefined();
      expect(body.data.updateProductVariants[0].stockLevels
        .find((l: any) => l.stockLocationId === stockLocationId).stockOnHand).toBe(value);
    };

    const stockAdapter = connector.reconcile!.stock!;
    const reconcile = startStockReconcile({ collection: db[STOCK_LEVELS_COLLECTION], adapter: stockAdapter, context });
    const localDoc = async () => (await db.products.findOne(product.id).exec())!;
    const rev = (await localDoc()).revision;
    const replicated = connector.traits.product.getStock(product).quantity;
    expect(replicated).toBeTypeOf('number');
    try {
      await setStock(stockOnHand + 7);
      const result = await reconcile.reconcileStock();
      expect(result.truncated).toBe(false);
      expect(result.written).toBeGreaterThanOrEqual(1);
      const overlay = new Map((await db[STOCK_LEVELS_COLLECTION].find().exec()).map((row) => [row.primary, row.get('value')]));
      const local = await localDoc();
      expect(getProductStock(local.toJSON(), connector.traits.product, stockAdapter, overlay).quantity).toBe(replicated! + 7);
      expect(local.revision).toBe(rev);
    } finally {
      reconcile.stop();
      await setStock(stockOnHand);
    }
  }, 120000);
});

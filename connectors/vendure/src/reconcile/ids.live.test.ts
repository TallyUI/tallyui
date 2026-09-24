// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { replicateRxCollection, type RxReplicationState } from 'rxdb/plugins/replication';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { startIdReconcile } from '@tallyui/database';
import { createVendureConnector } from '../index';
import { vendureProductSchema } from '../schemas/products';

addRxPlugin(RxDBDevModePlugin);

describe.skipIf(!process.env.VENDURE_DEV_URL)('live Vendure id reconcile', () => {
  let db: RxDatabase;
  let replication: RxReplicationState<any, any> | undefined;
  afterEach(async () => {
    await replication?.cancel();
    await db?.close();
  });

  it('drops a deleted variant, then a deleted product, from the local copy', async () => {
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

    const { taxCategories } = await admin(`{ taxCategories(options: { take: 1 }) { items { id } } }`);
    const taxCategoryId = taxCategories.items[0]?.id;
    expect(taxCategoryId).toBeDefined();
    const slug = `id-reconcile-live-${Date.now()}`;
    const { createProduct } = await admin(`mutation CreateProduct($input: CreateProductInput!) {
      createProduct(input: $input) { id }
    }`, { input: { translations: [{ languageCode: 'en', name: slug, slug, description: '' }] } });
    const productId = createProduct.id;

    let variantIds: string[] = [];
    let deleteVariant: (id: string) => Promise<void> = async () => {};
    let deleteProduct: () => Promise<void> = async () => {};
    let optionGroupId: string | undefined;

    try {
      const { createProductOptionGroup } = await admin(`mutation CreateOptionGroup($input: CreateProductOptionGroupInput!) {
        createProductOptionGroup(input: $input) { id options { id } }
      }`, {
        input: {
          code: `${slug}-size`,
          translations: [{ languageCode: 'en', name: 'Size' }],
          options: [
            { code: 'a', translations: [{ languageCode: 'en', name: 'A' }] },
            { code: 'b', translations: [{ languageCode: 'en', name: 'B' }] },
          ],
        },
      });
      optionGroupId = createProductOptionGroup.id;
      const optionIds: string[] = createProductOptionGroup.options.map((o: { id: string }) => o.id);
      expect(optionIds).toHaveLength(2);

      await admin(`mutation AddOptionGroup($productId: ID!, $optionGroupId: ID!) {
        addOptionGroupToProduct(productId: $productId, optionGroupId: $optionGroupId) { id }
      }`, { productId, optionGroupId });

      const { createProductVariants } = await admin(`mutation CreateVariants($input: [CreateProductVariantInput!]!) {
        createProductVariants(input: $input) { id }
      }`, {
        input: [0, 1].map((i) => ({
          productId, sku: `${slug}-${i}`, price: 1000, taxCategoryId, optionIds: [optionIds[i]],
          translations: [{ languageCode: 'en', name: `${slug} variant ${i}` }],
        })),
      });
      variantIds = createProductVariants.map((v: { id: string }) => v.id);
      expect(variantIds).toHaveLength(2);

      deleteVariant = async (id: string) => {
        const { deleteProductVariant } = await admin(`mutation DeleteVariant($id: ID!) {
          deleteProductVariant(id: $id) { result }
        }`, { id });
        expect(deleteProductVariant.result).toBe('DELETED');
      };
      deleteProduct = async () => {
        const { deleteProduct: result } = await admin(`mutation DeleteProduct($id: ID!) {
          deleteProduct(id: $id) { result }
        }`, { id: productId });
        expect(result.result).toBe('DELETED');
      };

      db = await createRxDatabase({
        name: 'vendureidreconcilelive', multiInstance: false,
        storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
      });
      await db.addCollections({ products: { schema: vendureProductSchema } });
      const connector = createVendureConnector();
      const context = { connectorId: 'vendure', baseUrl, headers };
      replication = replicateRxCollection<any, any>({
        collection: db.products, replicationIdentifier: 'vendure-id-reconcile-live',
        live: true, waitForLeadership: false,
        pull: { batchSize: 100, handler: (checkpoint, batchSize) => connector.replication!.products!.pull.handler(checkpoint, batchSize, context) },
      });
      await replication.awaitInSync();
      expect((await db.products.findOne(productId).exec())?.toJSON().variants).toHaveLength(2);

      const runner = startIdReconcile({
        collection: db.products, adapter: connector.reconcile!.ids!, context,
        reSync: () => replication!.reSync(), startDelayMs: null, intervalMs: 999_999_999,
      });
      try {
        await deleteVariant(variantIds[1]);
        await runner.reconcileIds();
        await replication.awaitInSync();
        expect((await db.products.findOne(productId).exec())!.toJSON().variants.map((v: any) => v.id)).toEqual([variantIds[0]]);

        await deleteProduct();
        await runner.reconcileIds();
        await replication.awaitInSync();
        expect(await db.products.findOne(productId).exec()).toBeNull();
      } finally {
        runner.stop();
      }
    } finally {
      // The product may already be gone; ignore a second delete's error.
      await admin(`mutation DeleteProduct($id: ID!) { deleteProduct(id: $id) { result } }`, { id: productId }).catch(() => {});
      // Best-effort: option groups aren't deleted with their product.
      if (optionGroupId) {
        await admin(`mutation DeleteOptionGroup($id: ID!) { deleteProductOptionGroup(id: $id) { result } }`, { id: optionGroupId }).catch(() => {});
      }
    }
  }, 120000);
});

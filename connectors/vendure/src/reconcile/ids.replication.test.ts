// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { replicateRxCollection, type RxReplicationState } from 'rxdb/plugins/replication';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { startIdReconcile } from '@tallyui/database';
import { vendureProductSchema } from '../schemas/products';
import { createVendureConnector } from '../index';

addRxPlugin(RxDBDevModePlugin);
const context = { connectorId: 'vendure', baseUrl: 'https://vendure.test', headers: {} };
const timestamp = (offset: number) => Date.UTC(2026, 0, 1) + offset + 0.5;
const iso = (ms: number) => new Date(ms).toISOString();
// More than the id reconcile's 1000-row page size, so a real sync reads two pages.
const TOTAL = 1050;
type Variant = { id: string; productId: string };
type Product = { id: string; name: string; updatedAt: number; variants: Variant[] };

/** Each product has two variants: 2p-1 and 2p. */
function makeProducts(): Product[] {
  return Array.from({ length: TOTAL }, (_, i) => {
    const id = String(i + 1);
    return {
      id, name: `Product ${id}`, updatedAt: timestamp(i),
      variants: [{ id: String(2 * (i + 1) - 1), productId: id }, { id: String(2 * (i + 1)), productId: id }],
    };
  });
}

let db: RxDatabase;
let replication: RxReplicationState<any, any> | undefined;
let databaseNumber = 0;
afterEach(async () => {
  await replication?.cancel();
  await db?.close();
  vi.restoreAllMocks();
});

/** A fake Vendure server for the product/variant/id-listing queries, from one mutable `products` array. `failIdPageAt` fails the id listing once skip reaches it, to prove "act only after a complete pass". */
function serve(products: Product[], failIdPageAt?: number) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const { query, variables: { options } } = JSON.parse(init!.body as string);
    const isVariantQuery = query.includes('productVariants');
    const isIdListing = query.includes('GetProductIds');
    const ids: string[] | undefined = options.filter?.id?.in;
    const after = options.filter?.updatedAt?.after;
    const skip = options.skip ?? 0;

    if (isIdListing && failIdPageAt !== undefined && skip === failIdPageAt) return new Response('Internal Server Error', { status: 500 });
    if (isVariantQuery) {
      const flat = products.flatMap((p) => p.variants.map((v) => ({ ...v, updatedAt: p.updatedAt })));
      const matching = flat.filter((v) => !after || v.updatedAt > Date.parse(after))
        .sort(options.sort?.updatedAt === 'DESC' ? (a, b) => b.updatedAt - a.updatedAt : (a, b) => Number(a.id) - Number(b.id));
      const page = matching.slice(skip, skip + options.take);
      const items = page.map((v) => ({ id: v.id, productId: v.productId, updatedAt: iso(v.updatedAt) }));
      return new Response(JSON.stringify({ data: { productVariants: { items, totalItems: matching.length } } }));
    }

    const matching = products.filter((p) => (!after || p.updatedAt > Date.parse(after)) && (!ids || ids.includes(p.id)))
      .sort(options.sort?.updatedAt === 'DESC' ? (a, b) => b.updatedAt - a.updatedAt : (a, b) => Number(a.id) - Number(b.id));
    const page = matching.slice(skip, skip + options.take);
    const items = page.map((p) => ({
      id: p.id, name: p.name, updatedAt: iso(p.updatedAt),
      variants: p.variants.map((v) => ({ id: v.id })),
    }));
    return new Response(JSON.stringify({ data: { products: { items, totalItems: matching.length } } }));
  });
}

async function start(products: Product[]) {
  db = await createRxDatabase({
    name: `vendureidreconcile${++databaseNumber}`, multiInstance: false,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
  });
  await db.addCollections({ products: { schema: vendureProductSchema } });
  const connector = createVendureConnector();
  replication = replicateRxCollection<any, any>({
    collection: db.products, replicationIdentifier: 'vendure-id-reconcile-proof',
    live: true, waitForLeadership: false, retryTime: 10,
    pull: {
      batchSize: 200,
      handler: (checkpoint, batchSize) => connector.replication!.products!.pull.handler(checkpoint, batchSize, context),
    },
  });
  await replication.awaitInSync();
  expect(await db.products.find().exec()).toHaveLength(TOTAL);
  const runner = startIdReconcile({
    collection: db.products, adapter: connector.reconcile!.ids!, context,
    reSync: () => replication!.reSync(), startDelayMs: null, intervalMs: 999_999_999,
  });
  return { connector, runner };
}

const snapshot = async () => Object.fromEntries((await db.products.find().exec()).map((d: any) => [d.id, d.revision]));

function deleteProduct(products: Product[], id: string) {
  const index = products.findIndex((p) => p.id === id);
  products.splice(index, 1);
}

function removeVariant(products: Product[], productId: string, variantId: string) {
  const product = products.find((p) => p.id === productId)!;
  product.variants = product.variants.filter((v) => v.id !== variantId);
  // updatedAt deliberately unchanged: neither the product nor the variant feed sees this.
}

describe('Vendure id reconcile, run against a real RxDB replication', () => {
  it('drops a deleted product and trims a vanished variant after a complete pass, leaving every other product untouched', async () => {
    const products = makeProducts();
    serve(products);
    const { runner } = await start(products);
    const before = await snapshot();
    deleteProduct(products, '11');
    removeVariant(products, '12', '24');

    const result = await runner.reconcileIds();
    expect(result.truncated).toBe(false);
    expect(result.queued).toBeGreaterThanOrEqual(2);
    await replication!.awaitInSync();
    expect(await db.products.findOne('11').exec()).toBeNull();
    const product12 = (await db.products.findOne('12').exec())!.toJSON();
    expect(product12.variants.map((v: any) => v.id).sort()).toEqual(['23']);

    const after = await snapshot();
    for (const [id, rev] of Object.entries(before)) {
      if (id === '11' || id === '12') continue;
      expect(after[id], `product ${id}`).toBe(rev);
    }
    runner.stop();
  }, 60000);

  it('rule proof: a failed id-listing page leaves everything unchanged, even with the same deletions pending', async () => {
    const products = makeProducts();
    serve(products);
    const { runner } = await start(products);
    const before = await snapshot();

    deleteProduct(products, '11');
    removeVariant(products, '12', '24');
    // Fail the id listing's second page (skip === 1000).
    serve(products, 1000);

    await expect(runner.reconcileIds()).rejects.toThrow();
    expect(await db.products.findOne('11').exec()).not.toBeNull();
    expect(await snapshot()).toEqual(before);
    runner.stop();
  }, 60000);
});

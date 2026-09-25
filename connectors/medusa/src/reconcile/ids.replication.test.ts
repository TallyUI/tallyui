// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { replicateRxCollection, type RxReplicationState } from 'rxdb/plugins/replication';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { connectorCollection, startIdReconcile } from '@tallyui/database';
import { medusaProductSchema } from '../schemas/products';
import { medusaConnector } from '../index';

addRxPlugin(RxDBDevModePlugin);
const context = { connectorId: 'medusa', baseUrl: 'https://medusa.test', headers: {} };
const stamp = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
const id = (n: number) => `prod_${String(n).padStart(4, '0')}`;
const BATCH_SIZE = 300;
// More than the id reconcile's 1000-row page size, so a real sync reads two id-listing pages.
const TOTAL = 1050;
type Variant = { id: string; updated_at: string };
type Product = { id: string; handle: string; status: string; title: string; updated_at: string; variants: Variant[] };

/** Each product has two variants, `<id>-v1` and `<id>-v2`. */
function makeProducts(): Product[] {
  return Array.from({ length: TOTAL }, (_, i) => {
    const n = i + 1;
    return {
      id: id(n), handle: `product-${n}`, status: 'published', title: `Product ${n}`, updated_at: stamp(n),
      variants: [{ id: `${id(n)}-v1`, updated_at: stamp(n) }, { id: `${id(n)}-v2`, updated_at: stamp(n) }],
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

/**
 * A fake Medusa server for the mark check, the id-ordered product listing,
 * the variant listing (for the variant feed, each variant with its own
 * `updated_at`) and the id listing, from one mutable `products` array.
 * `failIdPageAt` fails the id listing once its offset reaches it, to prove
 * "act only after a complete pass". Every request is tracked in `requests`.
 */
function serve(products: Product[], failIdPageAt?: number, requests: URLSearchParams[] = []) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input));
    const params = url.searchParams;
    requests.push(params);
    const offset = Number(params.get('offset') ?? 0);
    const limit = Number(params.get('limit') ?? 20);
    const order = params.get('order');
    const fields = params.get('fields') ?? '';
    const bound = params.get('updated_at[$gte]');
    const ids = params.getAll('id[]');
    const isIdListing = fields === 'id,variants.id';

    if (isIdListing) {
      if (failIdPageAt !== undefined && offset === failIdPageAt) return new Response('Internal Server Error', { status: 500 });
      const sorted = [...products].sort((a, b) => a.id.localeCompare(b.id));
      const page = sorted.slice(offset, offset + limit);
      return new Response(JSON.stringify({
        products: page.map((p) => ({ id: p.id, variants: p.variants.map((v) => ({ id: v.id })) })),
        count: sorted.length,
      }));
    }

    if (url.pathname === '/admin/product-variants') {
      const variants = products.flatMap((p) => p.variants.map((v) => ({ ...v, product_id: p.id })))
        .filter((v) => !bound || v.updated_at >= bound)
        .sort(order === 'id' ? (a, b) => a.id.localeCompare(b.id) : (a, b) => b.updated_at.localeCompare(a.updated_at));
      return new Response(JSON.stringify({ variants: variants.slice(offset, offset + limit), count: variants.length, offset, limit }));
    }

    let matching = products;
    if (ids.length) matching = matching.filter((p) => ids.includes(p.id));
    if (bound) matching = matching.filter((p) => p.updated_at >= bound);
    matching = [...matching].sort(order === 'id'
      ? (a, b) => a.id.localeCompare(b.id)
      : (a, b) => b.updated_at.localeCompare(a.updated_at));
    const page = matching.slice(offset, offset + limit);
    return new Response(JSON.stringify({ products: page, count: matching.length, offset, limit }));
  });
}

async function start(products: Product[], requests: URLSearchParams[] = []) {
  db = await createRxDatabase({
    name: `medusaidreconcile${++databaseNumber}`, multiInstance: false,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
  });
  await db.addCollections({ products: connectorCollection(medusaProductSchema) });
  serve(products, undefined, requests);
  replication = replicateRxCollection<any, any>({
    collection: db.products, replicationIdentifier: 'medusa-id-reconcile-proof',
    live: true, waitForLeadership: false, retryTime: 10,
    pull: {
      batchSize: BATCH_SIZE,
      handler: (checkpoint, batchSize) => medusaConnector.replication!.products!.pull.handler(checkpoint, batchSize, context),
    },
  });
  await replication.awaitInSync();
  expect(await db.products.find().exec()).toHaveLength(TOTAL);
  const runner = startIdReconcile({
    collection: db.products, adapter: medusaConnector.reconcile!.ids!, context,
    reSync: () => replication!.reSync(), startDelayMs: null, intervalMs: 999_999_999,
  });
  return { runner, requests };
}

const snapshot = async () => Object.fromEntries((await db.products.find().exec()).map((d: any) => [d.id, d.revision]));

function deleteProduct(products: Product[], productId: string) {
  const index = products.findIndex((p) => p.id === productId);
  products.splice(index, 1);
}

function removeVariant(products: Product[], productId: string, variantId: string) {
  const product = products.find((p) => p.id === productId)!;
  product.variants = product.variants.filter((v) => v.id !== variantId);
  // updated_at deliberately unchanged: the product replication never sees this.
}

describe('Medusa id reconcile, run against a real RxDB replication', () => {
  it('rule proof: a failed id-listing page leaves everything unchanged, even with the same deletions pending', async () => {
    const products = makeProducts();
    const { runner } = await start(products);
    const before = await snapshot();

    deleteProduct(products, id(11));
    removeVariant(products, id(12), `${id(12)}-v2`);
    // Fail the id listing's second page (offset === 1000).
    serve(products, 1000);

    await expect(runner.reconcileIds()).rejects.toThrow();
    expect(await db.products.findOne(id(11)).exec()).not.toBeNull();
    expect(await snapshot()).toEqual(before);
    runner.stop();
  }, 60000);

  it('drops a deleted product and trims a vanished variant after a complete pass, leaving every other product untouched', async () => {
    const products = makeProducts();
    const { runner } = await start(products);
    const before = await snapshot();
    deleteProduct(products, id(11));
    removeVariant(products, id(12), `${id(12)}-v2`);

    const result = await runner.reconcileIds();
    expect(result.truncated).toBe(false);
    expect(result.braked).toBe(false);
    expect(result.queued).toBeGreaterThanOrEqual(2);
    await replication!.awaitInSync();
    expect(await db.products.findOne(id(11)).exec()).toBeNull();
    const product12 = (await db.products.findOne(id(12)).exec())!.toJSON();
    expect(product12.variants.map((v: any) => v.id)).toEqual([`${id(12)}-v1`]);

    const after = await snapshot();
    for (const [pid, rev] of Object.entries(before)) {
      if (pid === id(11) || pid === id(12)) continue;
      expect(after[pid], `product ${pid}`).toBe(rev);
    }
    runner.stop();
  }, 60000);

  it('the fix proven in the loop: after the first sync, an idle sync requests only the mark, and a change to one product delivers exactly that product', async () => {
    const products = makeProducts();
    const requests: URLSearchParams[] = [];
    const { runner } = await start(products, requests);

    requests.length = 0;
    replication!.reSync();
    await replication!.awaitInSync();
    // One mark per feed that polls: the product feed and the variant feed.
    expect(requests).toHaveLength(2);
    for (const params of requests) {
      expect(params.get('limit')).toBe('1');
      expect(params.get('order')).toBe('-updated_at');
    }

    requests.length = 0;
    const changed = products.find((p) => p.id === id(5))!;
    Object.assign(changed, { title: 'Updated', updated_at: stamp(TOTAL + 1) });
    replication!.reSync();
    await replication!.awaitInSync();
    const listingRequests = requests.filter((p) => p.get('order') === 'id');
    expect(listingRequests).toHaveLength(1);
    const delivered = (await db.products.findOne(id(5)).exec())!.toJSON();
    expect(delivered.title).toBe('Updated');
    expect(await db.products.find().exec()).toHaveLength(TOTAL);
    runner.stop();
  }, 60000);
});

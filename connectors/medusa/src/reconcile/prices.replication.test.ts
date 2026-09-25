// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { replicateRxCollection, type RxReplicationState } from 'rxdb/plugins/replication';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { startFingerprintReconcile, startIdReconcile } from '@tallyui/database';
import { medusaProductSchema } from '../schemas/products';
import { medusaConnector } from '../index';

addRxPlugin(RxDBDevModePlugin);
const context = { connectorId: 'medusa', baseUrl: 'https://medusa.test', headers: {} };
const stamp = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
const id = (n: number) => `prod_${String(n).padStart(4, '0')}`;
const BATCH_SIZE = 300;
// More than the price reconcile's 1000-row page size, so a real pass reads more than one page.
const TOTAL = 1050;
type Price = { id: string; currency_code: string; amount: number; price_list_id?: string | null };
type Variant = { id: string; updated_at: string; prices: Price[] };
type Product = { id: string; handle: string; status: string; title: string; updated_at: string; variants: Variant[] };

/** Each product has two variants with one base price each. */
function makeProducts(): Product[] {
  return Array.from({ length: TOTAL }, (_, i) => {
    const n = i + 1;
    return {
      id: id(n), handle: `product-${n}`, status: 'published', title: `Product ${n}`, updated_at: stamp(n),
      variants: [
        { id: `${id(n)}-v1`, updated_at: stamp(n), prices: [{ id: `price_${id(n)}_v1`, currency_code: 'usd', amount: 1000 }] },
        { id: `${id(n)}-v2`, updated_at: stamp(n), prices: [{ id: `price_${id(n)}_v2`, currency_code: 'usd', amount: 2000 }] },
      ],
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
 * A fake Medusa server for the product listing (with nested variant prices)
 * and the `/admin/product-variants` listing the price reconcile and variant
 * feed both read, from one mutable `products` array.
 */
function serve(products: Product[]) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input));
    const params = url.searchParams;
    const offset = Number(params.get('offset') ?? 0);
    const limit = Number(params.get('limit') ?? 20);
    const order = params.get('order');
    const bound = params.get('updated_at[$gte]');
    const ids = params.getAll('id[]');

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

async function start(products: Product[]) {
  db = await createRxDatabase({
    name: `medusapricereconcile${++databaseNumber}`, multiInstance: false,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
  });
  await db.addCollections({ products: { schema: medusaProductSchema } });
  serve(products);
  replication = replicateRxCollection<any, any>({
    collection: db.products, replicationIdentifier: 'medusa-price-reconcile-proof',
    live: true, waitForLeadership: false, retryTime: 10,
    pull: {
      batchSize: BATCH_SIZE,
      handler: (checkpoint, batchSize) => medusaConnector.replication!.products!.pull.handler(checkpoint, batchSize, context),
    },
  });
  await replication.awaitInSync();
  expect(await db.products.find().exec()).toHaveLength(TOTAL);
  const runner = startFingerprintReconcile({
    collection: db.products, adapter: medusaConnector.reconcile!.prices!, context,
    reSync: () => replication!.reSync(), intervalMs: 999_999_999,
  });
  return { runner };
}

const snapshot = async () => Object.fromEntries((await db.products.find().exec()).map((d: any) => [d.id, d.revision]));

describe('Medusa price reconcile, run against a real RxDB replication', () => {
  it('re-delivers a product whose base price changed without bumping updated_at, leaving every other product untouched', async () => {
    const products = makeProducts();
    const { runner } = await start(products);
    const before = await snapshot();

    const changedVariant = products.find((p) => p.id === id(5))!.variants[0]!;
    // updated_at deliberately unchanged: exactly the drift the nightly backstop is for.
    changedVariant.prices[0]!.amount = 4242;

    const result = await runner.reconcile();
    expect(result.truncated).toBe(false);
    expect(result.queued).toBe(1);
    await replication!.awaitInSync();

    const delivered = (await db.products.findOne(id(5)).exec())!.toJSON();
    expect(delivered.variants.find((v: any) => v.id === changedVariant.id)?.prices[0].amount).toBe(4242);

    const after = await snapshot();
    for (const [pid, rev] of Object.entries(before)) {
      if (pid === id(5)) continue;
      expect(after[pid], `product ${pid}`).toBe(rev);
    }
    runner.stop();
  }, 60000);

  it('a product deleted on the server after its price drifted locally survives the fingerprint queue, and only an id-reconcile pass tombstones it', async () => {
    const products = makeProducts();
    // reSync is a no-op here: each phase below drives replication.reSync() itself, so the
    // queue's enqueue and its later drain never race against each other.
    db = await createRxDatabase({
      name: `medusapricereconcile${++databaseNumber}`, multiInstance: false,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    });
    await db.addCollections({ products: { schema: medusaProductSchema } });
    serve(products);
    replication = replicateRxCollection<any, any>({
      collection: db.products, replicationIdentifier: 'medusa-price-reconcile-proof',
      live: true, waitForLeadership: false, retryTime: 10,
      pull: {
        batchSize: BATCH_SIZE,
        handler: (checkpoint, batchSize) => medusaConnector.replication!.products!.pull.handler(checkpoint, batchSize, context),
      },
    });
    await replication.awaitInSync();
    expect(await db.products.find().exec()).toHaveLength(TOTAL);

    const target = id(11);
    const removedIndex = products.findIndex((p) => p.id === target);
    products[removedIndex]!.variants[0]!.prices[0]!.amount = 5150; // drifts, so the fingerprint pass queues it

    const priceRunner = startFingerprintReconcile({
      collection: db.products, adapter: medusaConnector.reconcile!.prices!, context,
      reSync: () => {}, intervalMs: 999_999_999,
    });
    const priceResult = await priceRunner.reconcile();
    expect(priceResult.queued).toBe(1);
    priceRunner.stop();

    products.splice(removedIndex, 1); // gone from the server before the queued entry is re-fetched
    replication.reSync();
    await replication.awaitInSync();
    expect(await db.products.findOne(target).exec()).not.toBeNull(); // survives: refreshOnly is never tombstoned

    const idRunner = startIdReconcile({
      collection: db.products, adapter: medusaConnector.reconcile!.ids!, context,
      reSync: () => {}, startDelayMs: null, intervalMs: 999_999_999,
    });
    const idResult = await idRunner.reconcileIds();
    expect(idResult.queued).toBe(1);
    expect(idResult.braked).toBe(false);
    idRunner.stop();

    replication.reSync();
    await replication.awaitInSync();
    expect(await db.products.findOne(target).exec()).toBeNull(); // the id reconcile's braked path does delete
  }, 60000);
});

// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { replicateRxCollection, type RxReplicationState } from 'rxdb/plugins/replication';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { FingerprintReconcileAdapter } from '@tallyui/core';
import { connectorCollection, startFingerprintReconcile } from '@tallyui/database';
import { vendureProductSchema } from '../schemas/products';
import { createVendureConnector } from '../index';
import { fetchPages as fetchPricePages } from './prices';

addRxPlugin(RxDBDevModePlugin);
const context = { connectorId: 'vendure', baseUrl: 'https://vendure.test', headers: {} };
const stamp = (n: number) => Date.UTC(2026, 0, 1) + n + 0.5;
const iso = (ms: number) => new Date(ms).toISOString();
// More than the price reconcile's 1,000-row page size, so a real pass reads more than one page.
const TOTAL = 1050;
type Variant = { id: string; productId: string; price: number; priceWithTax: number; currencyCode: string };
type Product = { id: string; name: string; slug: string; updatedAt: number; variants: Variant[] };

/** Each product has one variant, at $10 base and 10% tax. */
function makeProducts(): Product[] {
  return Array.from({ length: TOTAL }, (_, i) => {
    const n = i + 1;
    return {
      id: String(n), name: `Product ${n}`, slug: `product-${n}`, updatedAt: stamp(n),
      variants: [{ id: `v${n}`, productId: String(n), price: 1000, priceWithTax: 1100, currencyCode: 'USD' }],
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
 * A fake Vendure server for the product feed, the variant feed and the
 * price reconcile's `productVariants` price listing, from one mutable
 * `products` array (as in the id-reconcile and variant-feed replication
 * tests). `GetVariantPrices` is checked before the general `productVariants`
 * branch, since both request that same root field.
 */
function serve(products: Product[]) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const { query, variables: { options } } = JSON.parse(init!.body as string);
    const isPriceQuery = query.includes('GetVariantPrices');
    const isVariantRoot = query.includes('productVariants');
    const ids: string[] | undefined = options.filter?.id?.in;
    const after = options.filter?.updatedAt?.after;
    const skip = options.skip ?? 0;
    const allVariants = products.flatMap((p) => p.variants.map((v) => ({ ...v, updatedAt: p.updatedAt })));

    if (isPriceQuery) {
      const matching = [...allVariants].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      const page = matching.slice(skip, skip + options.take);
      const items = page.map((v) => ({ id: v.id, productId: v.productId, price: v.price, priceWithTax: v.priceWithTax, currencyCode: v.currencyCode }));
      return new Response(JSON.stringify({ data: { productVariants: { items, totalItems: matching.length } } }));
    }
    if (isVariantRoot) {
      const matching = allVariants.filter((v) => !after || v.updatedAt > Date.parse(after))
        .sort(options.sort?.updatedAt === 'DESC' ? (a, b) => b.updatedAt - a.updatedAt : (a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      const page = matching.slice(skip, skip + options.take);
      const items = page.map((v) => ({ id: v.id, productId: v.productId, updatedAt: iso(v.updatedAt) }));
      return new Response(JSON.stringify({ data: { productVariants: { items, totalItems: matching.length } } }));
    }
    const matching = products.filter((p) => (!after || p.updatedAt > Date.parse(after)) && (!ids || ids.includes(p.id)))
      .sort(options.sort?.updatedAt === 'DESC' ? (a, b) => b.updatedAt - a.updatedAt : (a, b) => Number(a.id) - Number(b.id));
    const page = matching.slice(skip, skip + options.take);
    const items = page.map((p) => ({
      id: p.id, name: p.name, slug: p.slug, updatedAt: iso(p.updatedAt),
      variants: p.variants.map((v) => ({ id: v.id, price: v.price, priceWithTax: v.priceWithTax, currencyCode: v.currencyCode })),
    }));
    return new Response(JSON.stringify({ data: { products: { items, totalItems: matching.length } } }));
  });
}

async function start(products: Product[]) {
  db = await createRxDatabase({
    name: `vendurepricereconcile${++databaseNumber}`, multiInstance: false,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
  });
  await db.addCollections({ products: connectorCollection(vendureProductSchema) });
  serve(products);
  const connector = createVendureConnector();
  replication = replicateRxCollection<any, any>({
    collection: db.products, replicationIdentifier: 'vendure-price-reconcile-proof',
    live: true, waitForLeadership: false, retryTime: 10,
    pull: {
      batchSize: 300,
      handler: (checkpoint, batchSize) => connector.replication!.products!.pull.handler(checkpoint, batchSize, context),
    },
  });
  await replication.awaitInSync();
  expect(await db.products.find().exec()).toHaveLength(TOTAL);
  return connector;
}

const runnerFor = (adapter: FingerprintReconcileAdapter) => startFingerprintReconcile({
  collection: db.products, adapter, context, reSync: () => replication!.reSync(), intervalMs: 999_999_999,
});
const snapshot = async () => Object.fromEntries((await db.products.find().exec()).map((d: any) => [d.id, d.revision]));

describe('Vendure price reconcile, run against a real RxDB replication', () => {
  it('re-delivers a product whose priceWithTax changed without bumping updatedAt, leaving every other product untouched', async () => {
    const products = makeProducts();
    const connector = await start(products);
    const before = await snapshot();

    const changed = products.find((p) => p.id === '5')!.variants[0]!;
    // updatedAt deliberately unchanged: exactly the tax-rate drift the nightly backstop is for.
    changed.priceWithTax = 4242;

    const runner = runnerFor(connector.reconcile!.prices!);
    const result = await runner.reconcile();
    expect(result.truncated).toBe(false);
    expect(result.queued).toBe(1);
    await replication!.awaitInSync();

    const delivered = (await db.products.findOne('5').exec())!.toJSON();
    expect(delivered.variants.find((v: any) => v.id === changed.id)?.priceWithTax).toBe(4242);

    const after = await snapshot();
    for (const [pid, rev] of Object.entries(before)) {
      if (pid === '5') continue;
      expect(after[pid], `product ${pid}`).toBe(rev);
    }
    runner.stop();
  }, 60000);

  it('mutation check: a fingerprint that always agrees never catches the drift', async () => {
    const products = makeProducts();
    const connector = await start(products);

    const changed = products.find((p) => p.id === '5')!.variants[0]!;
    changed.priceWithTax = 4242;

    // A broken adapter whose local fingerprint is always the same constant: every
    // product now disagrees with its (non-empty) remote fingerprint, so the whole
    // catalogue is queued instead of exactly the one product that actually drifted.
    // This proves the "exactly that product" assertion above is not vacuous.
    const brokenAdapter: FingerprintReconcileAdapter = {
      fetchPages: fetchPricePages, fingerprint: () => '', enqueue: connector.reconcile!.prices!.enqueue,
    };
    const runner = runnerFor(brokenAdapter);
    const result = await runner.reconcile();
    expect(result.queued).toBe(TOTAL);

    let failure: Error | undefined;
    try {
      expect(result.queued, 'a broken fingerprint should not pass the acceptance test\'s own assertion').toBe(1);
    } catch (error) {
      failure = error as Error;
    }
    expect(failure).toBeDefined();
    // eslint-disable-next-line no-console -- the spec asks the mutation check's failure message to be reported.
    console.log(`Mutation check failure message: ${failure!.message}`);
    runner.stop();
  }, 60000);
});

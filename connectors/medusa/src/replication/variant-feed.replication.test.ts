// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { replicateRxCollection, type RxReplicationState } from 'rxdb/plugins/replication';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { connectorCollection } from '@tallyui/database';
import { combinePullAdapters, type ReplicationAdapter } from '@tallyui/core';
import { medusaProductSchema } from '../schemas/products';
import { medusaConnector } from '../index';
import { medusaProductReplication } from './products';
import { createMedusaVariantFeedReplication } from './variant-feed';

addRxPlugin(RxDBDevModePlugin);
const context = { connectorId: 'medusa', baseUrl: 'https://medusa.test', headers: {} };
// Postgres timestamptz keeps microseconds; the API returns ms-truncated UTC.
const timestamp = (offset: number) => Date.UTC(2026, 0, 1) + offset + 0.5;
const iso = (ms: number) => new Date(ms).toISOString();
const productId = (n: number) => `prod_${String(n).padStart(4, '0')}`;
const variantId = (n: number) => `variant_${String(n).padStart(4, '0')}`;
type Product = { id: string; handle: string; status: string; title: string; updated_at: number };
type Variant = { id: string; product_id: string; amount: number; updated_at: number };
/** Which feed sent a request; carrier is the variant feed's limit-1 product read without an order. */
type Kind = 'productMark' | 'productPage' | 'variantMark' | 'variantPage' | 'parents' | 'carrier' | 'idListing';
type Request = { kind: Kind; offset: number; ids: string[] };
let db: RxDatabase;
let replication: RxReplicationState<any, any> | undefined;
let databaseNumber = 0;

afterEach(async () => {
  await replication?.cancel();
  await db?.close();
  vi.restoreAllMocks();
});

/** Keeps only the listed fields when `fields` is a plain list; `*` and `+` selections get the whole row. */
function project(row: Record<string, unknown>, fields: string | null) {
  const names = fields?.split(',') ?? [];
  if (!names.length || names.some((name) => /[*+.]/.test(name))) return row;
  return Object.fromEntries(names.map((name) => [name, row[name]]));
}

/**
 * An in-memory Medusa Admin API for `/admin/products` and `/admin/product-variants`,
 * honouring `updated_at[$gte]` (ties included), `order=id`, `order=-updated_at`,
 * `offset`, `limit`, `count`, `fields` and `id[]`. 2,000 products and 3,334
 * variants: variant n belongs to product ((n - 1) % 2000) + 1. One replication
 * on `products`, as the app runs it. `legacy` first syncs with the product feed
 * alone under the same identifier, as an install from before the variant feed.
 */
async function start({ variantPageSize, afterVariantPage, afterProductPage, legacy }: {
  variantPageSize?: number; afterVariantPage?: (offset: number, variants: Variant[]) => void;
  afterProductPage?: (offset: number, variants: Variant[]) => void; legacy?: boolean;
} = {}) {
  const products: Product[] = Array.from({ length: 2000 }, (_, i) => ({
    id: productId(i + 1), handle: `product-${i + 1}`, status: 'published', title: `Product ${i + 1}`, updated_at: timestamp(i + 1),
  }));
  const variants: Variant[] = Array.from({ length: 3334 }, (_, i) => ({
    id: variantId(i + 1), product_id: productId((i % 2000) + 1), amount: 1000, updated_at: timestamp(i + 1),
  }));
  const requests: Request[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input));
    const params = url.searchParams;
    const isVariants = url.pathname === '/admin/product-variants';
    const order = params.get('order');
    const fields = params.get('fields');
    const ids = params.getAll('id[]');
    const bound = params.get('updated_at[$gte]');
    const kind: Kind = isVariants
      ? (order === '-updated_at' ? 'variantMark' : 'variantPage')
      : fields === 'id,variants.id' ? 'idListing'
        : ids.length ? 'parents' : order === '-updated_at' ? 'productMark' : order === 'id' ? 'productPage' : 'carrier';
    const rows: (Product | Variant)[] = isVariants ? variants : products;
    const matching = rows
      .filter((r) => (!bound || r.updated_at >= Date.parse(bound)) && (!ids.length || ids.includes(r.id)))
      .sort(order === '-updated_at' ? (a, b) => b.updated_at - a.updated_at : (a, b) => a.id.localeCompare(b.id));
    const offset = Number(params.get('offset') ?? 0);
    const page = matching.slice(offset, offset + Number(params.get('limit') ?? 20));
    requests.push({ kind, offset, ids: page.map((r) => isVariants ? (r as Variant).product_id : r.id) });
    const byProduct = new Map<string, Variant[]>();
    if (!isVariants) for (const v of variants) byProduct.set(v.product_id, [...byProduct.get(v.product_id) ?? [], v]);
    const body = isVariants
      ? { variants: page.map((v) => project({ ...v, updated_at: iso(v.updated_at) }, fields)) }
      : { products: page.map((p) => project({
        ...p, updated_at: iso(p.updated_at),
        variants: (byProduct.get(p.id) ?? []).map((v) => ({ id: v.id, prices: [{ id: `price_${v.id}`, currency_code: 'usd', amount: v.amount }] })),
      }, fields)) };
    if (kind === 'variantPage') afterVariantPage?.(offset, variants);
    if (kind === 'productPage') afterProductPage?.(offset, variants);
    return new Response(JSON.stringify({ ...body, count: matching.length, offset, limit: page.length }));
  });
  db = await createRxDatabase({
    name: `medusavariantfeed${++databaseNumber}`, multiInstance: false,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
  });
  await db.addCollections({ products: connectorCollection(medusaProductSchema) });
  const adapter = variantPageSize
    ? combinePullAdapters({
      products: medusaProductReplication,
      variants: createMedusaVariantFeedReplication(variantPageSize),
    }, { legacyKey: 'products' })
    : medusaConnector.replication!.products!;
  const checkpoints: any[] = [];
  const variantPagesPerCall: number[] = [];
  const errors: unknown[] = [];
  const count = (kind: Kind) => requests.filter((r) => r.kind === kind).length;
  const replicate = (feed: ReplicationAdapter<any>) => replicateRxCollection<any, any>({
    collection: db.products, replicationIdentifier: 'medusa-products-proof',
    live: true, waitForLeadership: false, retryTime: 10,
    pull: {
      batchSize: 100,
      handler: async (checkpoint, batchSize) => {
        checkpoints.push(checkpoint);
        const pagesBefore = count('variantPage');
        const result = await feed.pull.handler(checkpoint, batchSize, context);
        variantPagesPerCall.push(count('variantPage') - pagesBefore);
        return result;
      },
    },
  });
  if (legacy) {
    replication = replicate(medusaProductReplication);
    await replication.awaitInSync();
    await replication.cancel();
    requests.length = 0;
    checkpoints.length = 0;
  }
  replication = replicate(adapter);
  replication.error$.subscribe((error) => errors.push(error));
  await replication.awaitInSync();
  expect(errors).toEqual([]);
  expect(await db.products.find().exec()).toHaveLength(2000);
  const delivered = (kind: Kind) => requests.filter((r) => r.kind === kind).flatMap((r) => r.ids);
  const reset = () => { requests.length = 0; checkpoints.length = 0; variantPagesPerCall.length = 0; };
  return { products, variants, requests, checkpoints, variantPagesPerCall, errors, delivered, count, reset };
}

async function sync() {
  replication!.reSync();
  await replication!.awaitInSync();
}

function change(variants: Variant[], ns: number[], offset = 10000) {
  for (const n of ns) Object.assign(variants.find((v) => v.id === variantId(n))!, { amount: 2000 + n, updated_at: timestamp(offset) });
}

async function expectPrices(variants: Variant[], ns: number[]) {
  for (const n of ns) {
    const variant = variants.find((v) => v.id === variantId(n))!;
    const local = (await db.products.findOne(variant.product_id).exec())!.toJSON();
    expect(local.variants.find((v: any) => v.id === variant.id)?.prices[0].amount, `Variant ${n}`).toBe(2000 + n);
  }
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const productIds = (ns: number[]) => ns.map(productId);
// `$gte` on the previous mark re-reads variant 3334, the newest: product 1334.
const overlap = [productId(1334)];

describe('Medusa product and variant feeds in one real RxDB replication', () => {
  it('fetches each product once on a fresh install: the variant feed starts from its seeded mark', async () => {
    const { delivered, count, checkpoints } = await start();
    const fetched = [...delivered('productPage'), ...delivered('parents'), ...delivered('carrier')];
    expect(fetched.length, 'product documents fetched').toBe(2000);
    expect(new Set(fetched).size).toBe(2000);
    expect(delivered('parents'), 'products the variant feed re-delivered').toEqual([]);
    expect(count('variantPage')).toBe(0);
    // The seed was stored with the first call's checkpoint.
    expect(checkpoints[1].variants).toMatchObject({ offset: 0, updated_at: iso(timestamp(3334)) });
  });

  it('keeps variant edits made during the first product pass, on and after its first page', async () => {
    let edited = false;
    const { variants } = await start({ afterProductPage: (offset, rows) => {
      if (edited || offset !== 0) return;
      edited = true;
      change(rows, [5], 10000); // Edit A, t1: product 5 was on the page just served.
      change(rows, [3300], 10001); // Edit B, t2 > t1: product 1300, on a later page.
    } });
    expect(edited).toBe(true);
    await sync();
    await expectPrices(variants, [5, 3300]);
  });

  it('keeps the full healing variant pass on an upgrade from a flat product checkpoint', async () => {
    const { checkpoints, delivered, count } = await start({ legacy: true });
    // The old flat checkpoint of a completed pass, as the product feed alone left it.
    expect(checkpoints[0]).toMatchObject({ offset: 0, updated_at: iso(timestamp(2000)) });
    expect(checkpoints[0]).not.toHaveProperty('products');
    expect(count('productPage')).toBe(0);
    // Every product has a variant, so the variant feed's full pass re-delivers them all.
    expect(new Set(delivered('parents')).size).toBe(2000);
  });

  it('delivers the parents of 30 variants whose prices changed across 25 products, product updated_at untouched', async () => {
    const { variants, delivered, errors, reset } = await start();
    reset();
    const changed = [...range(1, 25), ...range(2001, 2005)];
    change(variants, changed);
    await sync();
    await expectPrices(variants, changed);
    expect(delivered('productPage')).toEqual([]);
    expect(new Set(delivered('parents'))).toEqual(new Set([...productIds(range(1, 25)), ...overlap]));
    expect(errors).toEqual([]);
  });

  it('delivers all 240 parents of 250 changed variants in one sync, reading several 50-variant pages per call', async () => {
    const { variants, delivered, variantPagesPerCall, reset } = await start({ variantPageSize: 50 });
    reset();
    const changed = [...range(1, 240), ...range(2001, 2010)];
    change(variants, changed);
    await sync();
    await expectPrices(variants, changed);
    expect(new Set(delivered('parents'))).toEqual(new Set([...productIds(range(1, 240)), ...overlap]));
    // Each page yields at most 50 parents, below batch size 100, so a call must read on.
    expect(Math.max(...variantPagesPerCall)).toBeGreaterThan(1);
  });

  it('keeps a variant changed below the current offset mid-pass (Bug B), and a later one', async () => {
    let changed = false;
    // An upgrade, so the variant feed runs a full multi-page pass (a fresh install is seeded).
    const { variants } = await start({ legacy: true, afterVariantPage: (offset, rows) => {
      if (changed || offset !== 0) return;
      changed = true;
      change(rows, [5], 4000);
      change(rows, [3300], 5000);
    } });
    await sync();
    await expectPrices(variants, [5, 3300]);
  });

  it('makes exactly two requests on an idle sync, one mark per sub-feed', async () => {
    const { requests, reset } = await start();
    reset();
    vi.mocked(globalThis.fetch).mockClear();
    await sync();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(requests.map((r) => r.kind)).toEqual(['productMark', 'variantMark']);
  });

  it('advances the checkpoint past a last variant page whose parents were all deleted, then delivers a low-offset change', async () => {
    const { products, variants, checkpoints, count, reset } = await start({ variantPageSize: 100 });
    reset();
    // Page one (variants 101-200) fills a batch. The last page (variants 3235-3334,
    // which include the overlap) maps to parents 1235-1334, all deleted.
    change(variants, [...range(101, 200), ...range(3235, 3334)]);
    products.splice(1234, 100);
    await sync();
    const carriers = count('carrier');
    reset();
    change(variants, [5], 20000);
    await sync();
    // The first call of a sync gets the stored checkpoint.
    expect(checkpoints[0].variants).toMatchObject({ offset: 0, updated_at: iso(timestamp(10000)) });
    await expectPrices(variants, [5]);
    expect(carriers).toBe(1);
  });

  it('delivers a product rename and another product\'s variant price change in one sync', async () => {
    const { products, variants, delivered, reset } = await start();
    reset();
    Object.assign(products.find((p) => p.id === productId(7))!, { title: 'Renamed 7', updated_at: timestamp(10000) });
    change(variants, [9]);
    await sync();
    expect((await db.products.findOne(productId(7)).exec())!.title).toBe('Renamed 7');
    await expectPrices(variants, [9]);
    expect(delivered('productPage')).toContain(productId(7));
    expect(delivered('parents')).toContain(productId(9));
  });

  it('leaves no pass state behind: rows added between passes and variants deleted mid-pass below the cursor', async () => {
    let deleteMidPass = false;
    const { products, variants, requests, checkpoints, errors, reset } = await start({
      variantPageSize: 50,
      afterVariantPage: (offset, rows) => {
        if (!deleteMidPass || offset !== 50) return;
        deleteMidPass = false;
        for (const n of range(20, 29)) rows.splice(rows.findIndex((v) => v.id === variantId(n)), 1);
      },
    });
    reset();
    // Between passes: 150 price changes, a new variant on each of products 1500-1505
    // (their updated_at untouched), and a new product 2001 with two variants.
    change(variants, range(1, 150));
    for (const n of range(3335, 3340)) {
      variants.push({ id: variantId(n), product_id: productId(n - 1835), amount: 2000 + n, updated_at: timestamp(10000) });
    }
    products.push({ id: productId(2001), handle: 'product-2001', status: 'published', title: 'Product 2001', updated_at: timestamp(10000) });
    for (const n of [3341, 3342]) variants.push({ id: variantId(n), product_id: productId(2001), amount: 2000 + n, updated_at: timestamp(10000) });
    deleteMidPass = true;
    await sync();
    expect(errors).toEqual([]);

    // The deletion shrank the count below the stored pass_count, so the pass restarted from 0.
    const offsets = requests.filter((r) => r.kind === 'variantPage').map((r) => r.offset);
    expect(offsets.slice(0, 4)).toEqual([0, 50, 100, 0]);
    await expectPrices(variants, [...range(1, 19), ...range(30, 150), ...range(3335, 3342)]);
    for (const n of range(1500, 1505)) {
      const local = (await db.products.findOne(productId(n)).exec())!.toJSON();
      expect(local.variants.map((v: any) => v.id)).toContain(variantId(n + 1835));
    }
    expect(await db.products.find().exec()).toHaveLength(2001);

    reset();
    await sync();
    expect(requests.map((r) => r.kind)).toEqual(['productMark', 'variantMark']);
    const stored = checkpoints[0].variants;
    expect(stored).toMatchObject({ offset: 0, updated_at: iso(timestamp(10000)) });
    expect(stored.pass_mark).toBeUndefined();
    expect(stored.pass_count).toBeUndefined();
  });
});

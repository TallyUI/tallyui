// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { replicateRxCollection, type RxReplicationState } from 'rxdb/plugins/replication';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { vendureProductSchema } from '../schemas/products';
import { createVendureConnector } from '../index';
import { createVendureVariantFeedReplication } from './variant-feed';
import type { VendureProductCheckpoint } from './products';

addRxPlugin(RxDBDevModePlugin);
const context = { connectorId: 'vendure', baseUrl: 'https://vendure.test', headers: {} };
// Stored timestamps keep sub-ms precision; API output stays ms-truncated UTC.
const timestamp = (offset: number) => Date.UTC(2026, 0, 1) + offset + 0.5;
const iso = (ms: number) => new Date(ms).toISOString();
type Product = { id: string; name: string; slug: string; updatedAt: number };
type Variant = { id: string; productId: string; price: number; updatedAt: number };
type Feed = 'products' | 'productVariantFeed';
let db: RxDatabase;
let replications: Record<Feed, RxReplicationState<any, VendureProductCheckpoint>>;
let databaseNumber = 0;

afterEach(async () => {
  for (const replication of Object.values(replications ?? {})) await replication.cancel();
  await db?.close();
  vi.restoreAllMocks();
});

/** 2,000 products with 3,334 variants: variant n belongs to product ((n - 1) % 2000) + 1. */
async function start({ afterFirstVariantPage, variantPageSize }: {
  afterFirstVariantPage?: (variants: Variant[]) => void; variantPageSize?: number;
} = {}) {
  const products: Product[] = Array.from({ length: 2000 }, (_, i) => ({
    id: String(i + 1), name: `Product ${i + 1}`, slug: `product-${i + 1}`, updatedAt: timestamp(i),
  }));
  const variants: Variant[] = Array.from({ length: 3334 }, (_, i) => ({
    id: String(i + 1), productId: String((i % 2000) + 1), price: 1000, updatedAt: timestamp(i),
  }));
  let hooked = false;
  let variantPages = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const { query, variables: { options } } = JSON.parse(init!.body as string);
    const root = query.includes('productVariants') ? 'productVariants' : 'products';
    const rows: (Product | Variant)[] = root === 'products' ? products : variants;
    const after = options.filter?.updatedAt?.after;
    const ids: string[] | undefined = options.filter?.id?.in;
    const matching = rows.filter((r) => (!after || r.updatedAt > Date.parse(after)) && (!ids || ids.includes(r.id)))
      .sort(options.sort?.updatedAt === 'DESC'
        ? (a, b) => b.updatedAt - a.updatedAt
        : (a, b) => Number(a.id) - Number(b.id));
    const skip = options.skip ?? 0;
    const page = matching.slice(skip, skip + options.take);
    const items = root === 'productVariants'
      ? page.map((v) => ({ ...v, updatedAt: iso(v.updatedAt) }))
      : page.map((p) => ({
        ...p, createdAt: iso(timestamp(0)), updatedAt: iso(p.updatedAt),
        variants: variants.filter((v) => v.productId === p.id).map((v) => ({ id: v.id, price: v.price })),
      }));
    if (root === 'productVariants' && options.sort.id === 'ASC') variantPages++;
    if (root === 'productVariants' && options.sort.id === 'ASC' && skip === 0 && !hooked) {
      hooked = true;
      afterFirstVariantPage?.(variants);
    }
    return new Response(JSON.stringify({ data: { [root]: { items, totalItems: matching.length } } }));
  });
  db = await createRxDatabase({
    name: `vendurevariantfeed${++databaseNumber}`, multiInstance: false,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
  });
  await db.addCollections({ products: { schema: vendureProductSchema } });
  const connector = createVendureConnector();
  const adapters = {
    products: connector.replication!.products!,
    productVariantFeed: variantPageSize
      ? createVendureVariantFeedReplication(undefined, 0, variantPageSize)
      : connector.replication!.productVariantFeed!,
  };
  const delivered: Record<Feed, string[]> = { products: [], productVariantFeed: [] };
  const variantPagesPerCall: number[] = [];
  const replicate = (feed: Feed) => replicateRxCollection<any, VendureProductCheckpoint>({
    collection: db.products, replicationIdentifier: `vendure-${feed}-proof`,
    live: true, waitForLeadership: false, retryTime: 10,
    pull: {
      batchSize: 100,
      handler: async (checkpoint, batchSize) => {
        const pagesBefore = variantPages;
        const result = await adapters[feed].pull.handler(checkpoint, batchSize, context);
        delivered[feed].push(...result.documents.map((d) => String(d.id)));
        if (feed === 'productVariantFeed') variantPagesPerCall.push(variantPages - pagesBefore);
        return result;
      },
    },
  });
  replications = { products: replicate('products'), productVariantFeed: replicate('productVariantFeed') };
  await replications.products.awaitInSync();
  await replications.productVariantFeed.awaitInSync();
  expect(await db.products.find().exec()).toHaveLength(2000);
  return { variants, delivered, variantPagesPerCall };
}

async function sync() {
  for (const replication of Object.values(replications)) replication.reSync();
  for (const replication of Object.values(replications)) await replication.awaitInSync();
}

function change(variants: Variant[], ids: number[], offset = 10000) {
  for (const id of ids) Object.assign(variants[id - 1], { price: 2000 + id, updatedAt: timestamp(offset) });
}

async function expectPrices(variants: Variant[], ids: number[]) {
  for (const id of ids) {
    const variant = variants[id - 1];
    const local = await db.products.findOne(variant.productId).exec();
    expect(local!.toJSON().variants.find((v: any) => v.id === variant.id)?.price, `Variant ${id}`).toBe(2000 + id);
  }
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
// The 1 ms tie overlap re-reads variants 3333 and 3334 at the previous mark: products 1333 and 1334.
const overlap = ['1333', '1334'];

describe('Vendure variant feed in the real RxDB replication loop', () => {
  it('delivers the parents of 30 variants whose prices changed across 25 products', async () => {
    const { variants, delivered } = await start();
    delivered.products.length = 0;
    delivered.productVariantFeed.length = 0;
    const changed = [...range(1, 25), ...range(2001, 2005)];
    change(variants, changed);
    await sync();
    await expectPrices(variants, changed);
    expect(delivered.products).toEqual([]);
    expect(new Set(delivered.productVariantFeed)).toEqual(new Set([...range(1, 25).map(String), ...overlap]));
  });

  it('delivers all 240 parents of 250 changed variants in one sync, reading several 50-variant pages per call', async () => {
    const { variants, delivered, variantPagesPerCall } = await start({ variantPageSize: 50 });
    delivered.productVariantFeed.length = 0;
    variantPagesPerCall.length = 0;
    const changed = [...range(1, 240), ...range(2001, 2010)];
    change(variants, changed);
    await sync();
    await expectPrices(variants, changed);
    expect(new Set(delivered.productVariantFeed)).toEqual(new Set([...range(1, 240).map(String), ...overlap]));
    // Each page yields at most 50 parents, below batch size 100, so a call must read on.
    expect(Math.max(...variantPagesPerCall)).toBeGreaterThan(1);
  });

  it('keeps both early and late variant changes made after page one', async () => {
    const { variants } = await start({ afterFirstVariantPage: (rows) => {
      change(rows, [5], 3000 + 1000);
      change(rows, [3300], 3000 + 2000);
    } });
    await sync();
    await expectPrices(variants, [5, 3300]);
  });

  it('makes exactly one request on an idle sync', async () => {
    await start();
    vi.mocked(globalThis.fetch).mockClear();
    replications.productVariantFeed.reSync();
    await replications.productVariantFeed.awaitInSync();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

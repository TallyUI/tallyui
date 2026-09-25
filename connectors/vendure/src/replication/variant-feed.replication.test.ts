// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { replicateRxCollection, type RxReplicationState } from 'rxdb/plugins/replication';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { combinePullAdapters, type ReplicationAdapter } from '@tallyui/core';
import { connectorCollection } from '@tallyui/database';
import { vendureProductSchema } from '../schemas/products';
import { createVendureConnector } from '../index';
import { createVendureVariantFeedReplication } from './variant-feed';
import { createVendureProductReplication } from './products';

addRxPlugin(RxDBDevModePlugin);
const context = { connectorId: 'vendure', baseUrl: 'https://vendure.test', headers: {} };
// Stored timestamps keep sub-ms precision; API output stays ms-truncated UTC.
const timestamp = (offset: number) => Date.UTC(2026, 0, 1) + offset + 0.5;
const iso = (ms: number) => new Date(ms).toISOString();
type Product = { id: string; name: string; slug: string; updatedAt: number };
type Variant = { id: string; productId: string; price: number; updatedAt: number };
/** Which feed sent a request: marks include the skew probes; carrier is the variant feed's take-1 product read. */
type Kind = 'productMark' | 'productPage' | 'variantMark' | 'variantPage' | 'parents' | 'carrier';
let db: RxDatabase;
let replication: RxReplicationState<any, any> | undefined;
let databaseNumber = 0;

afterEach(async () => {
  await replication?.cancel();
  await db?.close();
  vi.restoreAllMocks();
});

/**
 * 2,000 products with 3,334 variants: variant n belongs to product ((n - 1) % 2000) + 1.
 * One replication on `products`, as the app runs it. `legacy` first syncs with the
 * product feed alone under the same identifier, then changes the server.
 */
async function start({ afterFirstVariantPage, afterFirstProductPage, variantPageSize, updatedAtSkewMs, legacy }: {
  afterFirstVariantPage?: (variants: Variant[]) => void; afterFirstProductPage?: (variants: Variant[]) => void;
  variantPageSize?: number; updatedAtSkewMs?: number; legacy?: (products: Product[]) => void;
} = {}) {
  const products: Product[] = Array.from({ length: 2000 }, (_, i) => ({
    id: String(i + 1), name: `Product ${i + 1}`, slug: `product-${i + 1}`, updatedAt: timestamp(i),
  }));
  const variants: Variant[] = Array.from({ length: 3334 }, (_, i) => ({
    id: String(i + 1), productId: String((i % 2000) + 1), price: 1000, updatedAt: timestamp(i),
  }));
  const requests: { kind: Kind; ids: string[] }[] = [];
  // beforeRead runs before the server reads its rows; afterRead holds a response already read.
  const hooks: { beforeRead?: (kind: Kind) => Promise<void>; afterRead?: (kind: Kind) => Promise<void> } = {};
  let hooked = false;
  let hookedProduct = false;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const { query, variables: { options } } = JSON.parse(init!.body as string);
    const root = query.includes('productVariants') ? 'productVariants' : 'products';
    const ids: string[] | undefined = options.filter?.id?.in;
    const kind: Kind = root === 'productVariants'
      ? (options.sort.updatedAt ? 'variantMark' : 'variantPage')
      : ids ? 'parents' : options.sort?.updatedAt ? 'productMark' : options.sort ? 'productPage' : 'carrier';
    await hooks.beforeRead?.(kind);
    const rows: (Product | Variant)[] = root === 'products' ? products : variants;
    const after = options.filter?.updatedAt?.after;
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
    requests.push({ kind, ids: page.map((r) => r.id) });
    if (kind === 'variantPage' && skip === 0 && !hooked) {
      hooked = true;
      afterFirstVariantPage?.(variants);
    }
    if (kind === 'productPage' && skip === 0 && !hookedProduct) {
      hookedProduct = true;
      afterFirstProductPage?.(variants);
    }
    const body = JSON.stringify({ data: { [root]: { items, totalItems: matching.length } } });
    await hooks.afterRead?.(kind);
    return new Response(body);
  });
  db = await createRxDatabase({
    name: `vendurevariantfeed${++databaseNumber}`, multiInstance: false,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
  });
  await db.addCollections({ products: connectorCollection(vendureProductSchema) });
  const adapter = variantPageSize || updatedAtSkewMs
    ? combinePullAdapters({
      products: createVendureProductReplication(),
      variants: createVendureVariantFeedReplication(undefined, updatedAtSkewMs ?? 0, variantPageSize),
    }, { legacyKey: 'products' })
    : createVendureConnector().replication!.products!;
  const checkpoints: any[] = [];
  const variantPagesPerCall: number[] = [];
  const count = (kind: Kind) => requests.filter((r) => r.kind === kind).length;
  const replicate = (feed: ReplicationAdapter<any>) => replicateRxCollection<any, any>({
    collection: db.products, replicationIdentifier: 'vendure-products-proof',
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
    replication = replicate(createVendureProductReplication());
    await replication.awaitInSync();
    await replication.cancel();
    legacy(products);
    requests.length = 0;
    checkpoints.length = 0;
  }
  replication = replicate(adapter);
  await replication.awaitInSync();
  expect(await db.products.find().exec()).toHaveLength(2000);
  const delivered = (kind: Kind) => requests.filter((r) => r.kind === kind).flatMap((r) => r.ids);
  const reset = () => { requests.length = 0; checkpoints.length = 0; variantPagesPerCall.length = 0; };
  return { products, variants, requests, hooks, checkpoints, variantPagesPerCall, delivered, count, reset };
}

async function sync() {
  replication!.reSync();
  await replication!.awaitInSync();
}

function change(variants: Variant[], ids: number[], offset = 10000) {
  for (const id of ids) Object.assign(variants[id - 1], { price: 2000 + id, updatedAt: timestamp(offset) });
}

function rename(products: Product[], id: number, offset = 10000) {
  Object.assign(products.find((p) => p.id === String(id))!, { name: `Renamed ${id}`, updatedAt: timestamp(offset) });
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

describe('Vendure products and variant feeds in one real RxDB replication', () => {
  it('fetches each product once on a fresh install: the variant feed starts from its seeded high water', async () => {
    const { delivered, count, checkpoints } = await start();
    const fetched = [...delivered('productPage'), ...delivered('parents'), ...delivered('carrier')];
    expect(fetched.length, 'product documents fetched').toBe(2000);
    expect(new Set(fetched).size).toBe(2000);
    expect(delivered('parents'), 'products the variant feed re-delivered').toEqual([]);
    expect(count('variantPage')).toBe(0);
    // The seed was stored with the first call's checkpoint.
    expect(checkpoints[1].variants).toMatchObject({ skip: 0, updatedAt: iso(timestamp(3333)) });
  }, 60000);

  it('keeps both early and late variant edits made during the first sync, on and after the first product page', async () => {
    let edited = false;
    const { variants } = await start({ afterFirstProductPage: (rows) => {
      edited = true;
      change(rows, [5], 10000); // Edit A, t1: product 5 was on the page just served.
      change(rows, [1300], 10001); // Edit B, t2 > t1: product 1300, on a later page.
    } });
    expect(edited).toBe(true);
    await sync();
    await expectPrices(variants, [5, 1300]);
  }, 60000);

  it('catches an edit whose updatedAt ties the seeded mark exactly (the 1 ms overlap)', async () => {
    const { variants, reset } = await start();
    reset();
    // Variant 10 ties the pre-edit newest mark (timestamp 3333) exactly; variant 20
    // is 1 ms later so the pass runs at all. Vendure's `after` is strict, so the
    // feed reads `since - 1 ms`, catching the tie.
    change(variants, [10], 3333);
    change(variants, [20], 3334);
    await sync();
    await expectPrices(variants, [10, 20]);
  }, 60000);

  it('with updatedAtSkewMs set, catches an edit up to that skew before the seeded mark', async () => {
    const skewMs = 5000;
    const { variants, reset } = await start({ updatedAtSkewMs: skewMs });
    reset();
    // Variant 10 sits exactly skewMs before the pre-edit newest mark, at the widened
    // filter's edge; variant 20 is later, so the pass runs at all.
    change(variants, [10], 3333 - skewMs);
    change(variants, [20], 3334);
    await sync();
    await expectPrices(variants, [10, 20]);
  }, 60000);

  it('delivers the parents of 30 variants whose prices changed across 25 products', async () => {
    const { variants, delivered, reset } = await start();
    reset();
    const changed = [...range(1, 25), ...range(2001, 2005)];
    change(variants, changed);
    await sync();
    await expectPrices(variants, changed);
    expect(delivered('productPage')).toEqual([]);
    expect(new Set(delivered('parents'))).toEqual(new Set([...range(1, 25).map(String), ...overlap]));
  }, 60000);

  it('delivers all 240 parents of 250 changed variants in one sync, reading several 50-variant pages per call', async () => {
    const { variants, delivered, variantPagesPerCall, reset } = await start({ variantPageSize: 50 });
    reset();
    const changed = [...range(1, 240), ...range(2001, 2010)];
    change(variants, changed);
    await sync();
    await expectPrices(variants, changed);
    expect(new Set(delivered('parents'))).toEqual(new Set([...range(1, 240).map(String), ...overlap]));
    // Each page yields at most 50 parents, below batch size 100, so a call must read on.
    expect(Math.max(...variantPagesPerCall)).toBeGreaterThan(1);
  }, 60000);

  it('keeps both early and late variant changes made after page one', async () => {
    // An upgrade, so the variant feed runs a full multi-page pass (a fresh install is seeded).
    const { variants } = await start({ legacy: () => {}, afterFirstVariantPage: (rows) => {
      change(rows, [5], 3000 + 1000);
      change(rows, [3300], 3000 + 2000);
    } });
    await sync();
    await expectPrices(variants, [5, 3300]);
  }, 60000);

  it('makes exactly two requests on an idle sync, one mark per feed', async () => {
    const { requests, reset } = await start();
    reset();
    vi.mocked(globalThis.fetch).mockClear();
    await sync();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(requests.map((r) => r.kind)).toEqual(['productMark', 'variantMark']);
  }, 60000);

  it('delivers a product change and a variant change of another product in one sync', async () => {
    const { products, variants, delivered, reset } = await start();
    reset();
    rename(products, 7);
    change(variants, [9]);
    await sync();
    expect((await db.products.findOne('7').exec())!.name).toBe('Renamed 7');
    await expectPrices(variants, [9]);
    expect(delivered('productPage')).toContain('7');
    expect(delivered('parents')).toContain('9');
  }, 60000);

  it('never lets a parent fetch made before a rename revert it', async () => {
    const { products, variants, requests, hooks } = await start();
    change(variants, [7]);
    const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
    const deferred = () => { let resolve!: () => void; return { promise: new Promise<void>((r) => { resolve = r; }), resolve }; };
    const [held, renamed, gate] = [deferred(), deferred(), deferred()];
    // Force the worst order a combiner allows. If the variant feed starts while the
    // product feed's first mark is open (a concurrent combiner), hold that mark
    // until the rename, so the product feed reads the new name before the stale
    // parent response below lands. A sequential combiner never reaches this.
    let productMarkOpen = false;
    hooks.beforeRead = async (kind) => {
      if (kind !== 'productMark') return;
      hooks.beforeRead = undefined;
      productMarkOpen = true;
      const seen = requests.length;
      await tick();
      if (requests.slice(seen).some((r) => r.kind.startsWith('variant'))) await renamed.promise;
      productMarkOpen = false;
    };
    hooks.afterRead = async (kind) => {
      if (kind !== 'parents') return;
      hooks.afterRead = undefined;
      held.resolve();
      await gate.promise;
    };
    const names: string[] = [];
    const subscription = db.products.findOne('7').$.subscribe((doc) => doc && names.push(doc.name));
    const syncing = sync();
    await held.promise; // The variant feed's parent fetch has read product 7 with its old name.
    const productFeedRunning = productMarkOpen;
    rename(products, 7, 20000);
    renamed.resolve();
    // Release only after the product feed has fetched the renamed product and returned.
    while (productFeedRunning && !requests.some((r) => r.kind === 'productPage' && r.ids.includes('7'))) await tick();
    if (productFeedRunning) await tick();
    gate.resolve();
    await syncing;
    for (let i = 0; i < 3; i++) await sync();
    subscription.unsubscribe();
    expect((await db.products.findOne('7').exec())!.name).toBe('Renamed 7');
    await expectPrices(variants, [7]);
    const renamedAt = names.indexOf('Renamed 7');
    expect(renamedAt).toBeGreaterThanOrEqual(0);
    expect(names.slice(renamedAt).every((name) => name === 'Renamed 7'), names.join(', ')).toBe(true);
  }, 60000);

  it('advances the checkpoint past variant pages whose parents were all deleted', async () => {
    const { products, variants, checkpoints, count, reset } = await start({ variantPageSize: 100 });
    reset();
    // Page one (variants 101-200) fills a batch. The last page (variants 3235-3334,
    // which include the tie overlap) maps to parents 1235-1334, all deleted.
    change(variants, [...range(101, 200), ...range(3235, 3334)]);
    products.splice(1234, 100);
    await sync();
    const carriers = count('carrier');
    reset();
    change(variants, [5], 20000);
    await sync();
    // The first call of a sync gets the stored checkpoint.
    expect(checkpoints[0].variants).toMatchObject({ skip: 0, updatedAt: iso(timestamp(10000)) });
    await expectPrices(variants, [5]);
    expect(carriers).toBe(1);
  }, 60000);

  it('upgrades from a stored product-feed checkpoint without re-downloading the catalogue', async () => {
    const { checkpoints, delivered, count } = await start({ legacy: (products) => rename(products, 3) });
    // The old flat checkpoint of a completed pass, as the product feed alone left it.
    expect(checkpoints[0]).toMatchObject({ skip: 0, updatedAt: iso(timestamp(1999)) });
    expect(checkpoints[0]).not.toHaveProperty('products');
    // Besides one-row marks and probes, one page for the real change; 1999 and 2000 are the tie overlap.
    expect(count('productPage')).toBe(1);
    expect(delivered('productPage')).toEqual(['3', '1999', '2000']);
    expect((await db.products.findOne('3').exec())!.name).toBe('Renamed 3');
    // The variant feed runs its first full pass: every product has a variant.
    expect(new Set(delivered('parents')).size).toBe(2000);
  }, 60000);
});

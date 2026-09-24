// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { replicateRxCollection, type RxReplicationState } from 'rxdb/plugins/replication';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { resolvePrice, type FingerprintReconcileAdapter, type SyncContext } from '@tallyui/core';
import { startFingerprintReconcile } from '@tallyui/database';
import { medusaProductSchema } from '../schemas/products';
import { toDocument } from '../replication/products';
import { medusaConnector } from '../index';

addRxPlugin(RxDBDevModePlugin);

// A made-up key for tests only.
const KEY = 'pk_test_not_a_real_key_0123456789';
const admin: SyncContext = { connectorId: 'medusa', baseUrl: 'https://medusa.test', headers: { Authorization: 'Bearer admin_token' } };
const priced: SyncContext = { ...admin, pricingContext: { region_id: 'reg_eu', currency_code: 'eur', publishable_key: KEY } };
const traits = medusaConnector.traits.product;
const TOTAL = 500;
const HOUR = 3_600_000;
const stamp = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
const id = (n: number) => `prod_${String(n).padStart(4, '0')}`;
const SALE = id(5), OVERRIDE = id(6), TAXED = id(7), DRAFT = id(10), OTHER_CHANNEL = id(11), SPRING = [id(20), id(21)], FUTURE = id(30);

type Price = { id: string; currency_code: string; amount: number };
type Variant = { id: string; updated_at: string; prices: Price[] };
type Product = { id: string; handle: string; status: string; title: string; updated_at: string; channel: string; variants: Variant[] };
type ListPrice = { variant_id: string; amount: number; tax_inclusive?: boolean };
type PriceList = { id: string; type: 'sale' | 'override'; starts_at: number | null; ends_at: number | null; prices: ListPrice[] };

/**
 * An in-memory Medusa: the admin product and variant listings (as in D2a's
 * test), and `/store/products`, which needs the publishable key (400
 * without), prices one region (`reg_eu`, EUR) from a price-list table with a
 * type and dates against a fake clock, lists only published products in the
 * key's sales channel, and honours `id[]`, `region_id`, `limit`, `offset`,
 * `order=id` and `fields`.
 */
function world() {
  const clock = { now: Date.UTC(2026, 5, 1) };
  const products: Product[] = Array.from({ length: TOTAL }, (_, i) => {
    const n = i + 1;
    return {
      id: id(n), handle: `product-${n}`, status: id(n) === DRAFT ? 'draft' : 'published', title: `Product ${n}`, updated_at: stamp(n),
      channel: id(n) === OTHER_CHANNEL ? 'sc_web' : 'sc_pos',
      variants: [1, 2].map((v) => ({ id: `${id(n)}-v${v}`, updated_at: stamp(n), prices: [{ id: `price_${id(n)}_v${v}`, currency_code: 'eur', amount: 10 * v }] })),
    };
  });
  const priceLists: PriceList[] = [
    { id: 'plist_flash', type: 'sale', starts_at: clock.now - HOUR, ends_at: clock.now + HOUR, prices: [
      { variant_id: `${SALE}-v1`, amount: 8 }, { variant_id: `${DRAFT}-v1`, amount: 8 }, { variant_id: `${OTHER_CHANNEL}-v1`, amount: 8 },
    ] },
    { id: 'plist_spring', type: 'sale', starts_at: null, ends_at: null, prices: SPRING.map((p) => ({ variant_id: `${p}-v1`, amount: 9 })) },
    { id: 'plist_b2b', type: 'override', starts_at: null, ends_at: null, prices: [{ variant_id: `${OVERRIDE}-v1`, amount: 12 }] },
    { id: 'plist_gross', type: 'sale', starts_at: null, ends_at: null, prices: [{ variant_id: `${TAXED}-v1`, amount: 7.5, tax_inclusive: true }] },
    { id: 'plist_later', type: 'sale', starts_at: clock.now + 48 * HOUR, ends_at: null, prices: [{ variant_id: `${FUTURE}-v1`, amount: 5 }] },
  ];

  const calculatedPrice = (variant: Variant) => {
    const base = variant.prices.find((p) => p.currency_code === 'eur')!;
    const active = priceLists
      .filter((l) => (l.starts_at === null || l.starts_at <= clock.now) && (l.ends_at === null || clock.now < l.ends_at))
      .flatMap((list) => list.prices.filter((p) => p.variant_id === variant.id).map((price) => ({ list, price })));
    const sale = active.filter((a) => a.list.type === 'sale').sort((a, b) => a.price.amount - b.price.amount)[0];
    const chosen = active.find((a) => a.list.type === 'override') ?? (sale && sale.price.amount < base.amount ? sale : undefined);
    return {
      id: `pset_${variant.id}`, currency_code: 'eur',
      calculated_amount: chosen?.price.amount ?? base.amount, original_amount: base.amount,
      is_calculated_price_tax_inclusive: chosen?.price.tax_inclusive ?? false, is_original_price_tax_inclusive: false,
      calculated_price: { id: chosen ? `${chosen.list.id}_${variant.id}` : base.id, price_list_id: chosen?.list.id ?? null, price_list_type: chosen?.list.type ?? null },
      original_price: { id: base.id, price_list_id: null, price_list_type: null },
    };
  };

  const counts = { store: 0, storeAuthorization: 0 };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
  const adminRow = ({ channel: _, ...product }: Product) => product;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const params = url.searchParams;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const offset = Number(params.get('offset') ?? 0);
    const limit = Number(params.get('limit') ?? 20);
    const order = params.get('order');
    const bound = params.get('updated_at[$gte]');
    const ids = params.getAll('id[]');

    if (url.pathname === '/store/products') {
      counts.store++;
      if (Object.keys(headers).some((h) => h.toLowerCase() === 'authorization')) counts.storeAuthorization++;
      if (headers['x-publishable-api-key'] !== KEY) return json({ message: 'A valid publishable key is required to proceed with the request' }, 400);
      if (params.get('region_id') !== 'reg_eu') return json({ message: 'Region not found' }, 400);
      let rows = products.filter((p) => p.status === 'published' && p.channel === 'sc_pos');
      if (ids.length) rows = rows.filter((p) => ids.includes(p.id));
      if (order === 'id') rows = [...rows].sort(byId);
      const withPrices = (params.get('fields') ?? '').split(',').includes('*variants.calculated_price');
      const page = rows.slice(offset, offset + limit).map((p) => ({
        id: p.id, variants: p.variants.map((v) => ({ id: v.id, ...(withPrices ? { calculated_price: calculatedPrice(v) } : {}) })),
      }));
      return json({ products: page, count: rows.length, offset, limit });
    }

    if (url.pathname === '/admin/product-variants') {
      const variants = products.flatMap((p) => p.variants.map((v) => ({ ...v, product_id: p.id })))
        .filter((v) => !bound || v.updated_at >= bound)
        .sort(order === 'id' ? byId : (a, b) => b.updated_at.localeCompare(a.updated_at));
      return json({ variants: variants.slice(offset, offset + limit), count: variants.length, offset, limit });
    }

    let matching = products;
    if (ids.length) matching = matching.filter((p) => ids.includes(p.id));
    if (bound) matching = matching.filter((p) => p.updated_at >= bound);
    matching = [...matching].sort(order === 'id' ? byId : (a, b) => b.updated_at.localeCompare(a.updated_at));
    return json({ products: matching.slice(offset, offset + limit).map(adminRow), count: matching.length, offset, limit });
  });
  return { clock, products, priceLists, counts, adminRow };
}

let db: RxDatabase;
let replication: RxReplicationState<any, any> | undefined;
let databaseNumber = 0;
afterEach(async () => {
  await replication?.cancel();
  await db?.close();
  vi.restoreAllMocks();
});

/** One replication over `medusaConnector.replication.products`, with `context` as the sync context. */
async function start(context: SyncContext) {
  db = await createRxDatabase({
    name: `medusacalculated${++databaseNumber}`, multiInstance: false,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
  });
  await db.addCollections({ products: { schema: medusaProductSchema } });
  const errors: unknown[] = [];
  replication = replicateRxCollection<any, any>({
    collection: db.products, replicationIdentifier: 'medusa-calculated-prices-proof',
    live: true, waitForLeadership: false, retryTime: 10,
    pull: { batchSize: 100, handler: (checkpoint, batchSize) => medusaConnector.replication!.products!.pull.handler(checkpoint, batchSize, context) },
  });
  replication.error$.subscribe((error) => errors.push(error));
  await replication.awaitInSync();
  expect(errors).toEqual([]);
  expect(await db.products.find().exec()).toHaveLength(TOTAL);
  const runner = (adapter: FingerprintReconcileAdapter) => startFingerprintReconcile({
    collection: db.products, adapter, context, reSync: () => replication!.reSync(), intervalMs: 999_999_999, maxPages: 1000,
  });
  return { runner, errors };
}

const docOf = async (productId: string) => (await db.products.findOne(productId).exec())!.toJSON() as any;
const snapshot = async () => Object.fromEntries((await db.products.find().exec()).map((d: any) => [d.id, d.revision]));
// A resolved price keeps its tax flag; every price these expectations read is tax-exclusive.
const eur = (amount: number) => ({ amount, currency: 'EUR', taxInclusive: false });

describe('Medusa calculated prices, run against a real RxDB replication', () => {
  it('1. initial sync: a sale resolves with the base as was; a draft and an outside-channel product are null, unsellable and unpriced', async () => {
    const w = world();
    const { runner } = await start(priced);

    expect(resolvePrice(traits.getPrices(await docOf(SALE)), 'EUR')).toEqual({ current: eur(800), was: eur(1000) });
    expect(resolvePrice(traits.getPrices(await docOf(OVERRIDE)), 'EUR')).toEqual({ current: eur(1200) });
    expect(resolvePrice(traits.getPrices(await docOf(FUTURE)), 'EUR')).toEqual({ current: eur(1000) });
    for (const productId of [DRAFT, OTHER_CHANNEL]) {
      const doc = await docOf(productId);
      expect(doc.variants.map((v: any) => v.calculated_price), productId).toEqual([null, null]);
      expect(traits.isSellable(doc), productId).toBe(false);
      expect(traits.getPrices(doc), productId).toEqual([]);
    }
    expect(traits.isSellable(await docOf(id(1)))).toBe(true);

    const calculated = runner(medusaConnector.reconcile!.calculatedPrices!);
    // The unreported count is exactly the draft and the outside-channel product.
    expect(await calculated.reconcile()).toEqual({ pages: 5, compared: TOTAL - 2, queued: 0, truncated: false, unreported: 2 });
    expect(w.counts.storeAuthorization).toBe(0);
    calculated.stop();
  }, 60000);

  it('2. a price-list amount change with no timestamp bump: the check and a sync re-deliver exactly those products', async () => {
    const w = world();
    const { runner } = await start(priced);
    const before = await snapshot();

    // No product or variant updated_at changes.
    for (const price of w.priceLists.find((l) => l.id === 'plist_spring')!.prices) price.amount = 8.5;
    const calculated = runner(medusaConnector.reconcile!.calculatedPrices!);
    expect(await calculated.reconcile()).toMatchObject({ queued: 2, truncated: false });
    await replication!.awaitInSync();

    const after = await snapshot();
    for (const productId of SPRING) {
      expect(after[productId], productId).not.toBe(before[productId]);
      expect(resolvePrice(traits.getPrices(await docOf(productId)), 'EUR')).toEqual({ current: eur(850), was: eur(1000) });
    }
    for (const [productId, revision] of Object.entries(before)) {
      if (!SPRING.includes(productId)) expect(after[productId], productId).toBe(revision);
    }
    expect(await calculated.reconcile()).toMatchObject({ queued: 0 });
    calculated.stop();
  }, 60000);

  it('3. a sale ends when the clock passes ends_at: the next check re-delivers the product at its base price, with no was', async () => {
    const w = world();
    const { runner } = await start(priced);
    const before = await snapshot();

    w.clock.now += 2 * HOUR;
    const calculated = runner(medusaConnector.reconcile!.calculatedPrices!);
    expect(await calculated.reconcile()).toMatchObject({ queued: 1, truncated: false });
    await replication!.awaitInSync();

    const after = await snapshot();
    expect(after[SALE]).not.toBe(before[SALE]);
    expect(resolvePrice(traits.getPrices(await docOf(SALE)), 'EUR')).toEqual({ current: eur(1000) });
    expect(Object.keys(before).filter((productId) => after[productId] !== before[productId])).toEqual([SALE]);
    calculated.stop();
  }, 60000);

  it('4. the nightly base-price check (D2a) is blind to sales: it queues 0 right after the initial sync', async () => {
    world();
    const { runner } = await start(priced);
    const prices = runner(medusaConnector.reconcile!.prices!);
    expect(await prices.reconcile()).toMatchObject({ queued: 0, truncated: false, compared: TOTAL });
    prices.stop();
  }, 60000);

  it('5. mode off: without a pricing context the documents are exactly the admin projection, and the check is empty and complete', async () => {
    const w = world();
    const { runner } = await start(admin);

    for (const product of w.products) {
      const doc = await docOf(product.id);
      expect(doc, product.id).toEqual(toDocument(w.adminRow(product)));
      for (const variant of doc.variants) expect(variant).not.toHaveProperty('calculated_price');
    }
    const calculated = runner(medusaConnector.reconcile!.calculatedPrices!);
    expect(await calculated.reconcile()).toEqual({ pages: 0, compared: 0, queued: 0, truncated: false, unreported: 0 });
    expect(w.counts.store).toBe(0);
    calculated.stop();
  }, 60000);

  it('6. a tax-inclusive sale price carries taxInclusive: true on its sale ProductPrice', async () => {
    world();
    await start(priced);
    expect(traits.getPrices(await docOf(TAXED))).toStrictEqual([
      { amount: 1000, currency: 'EUR', kind: 'base', taxInclusive: false },
      { amount: 750, currency: 'EUR', kind: 'sale', taxInclusive: true },
    ]);
  }, 60000);
});

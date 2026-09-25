// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import type { RxReplicationState } from 'rxdb/plugins/replication';
import type { ReplicationAdapter, SyncContext, TallyConnector } from '@tallyui/core';
import { medusaConnector, medusaProductSchema } from '@tallyui/connector-medusa';
import { posOrderSchema, type PosOrder } from '@tallyui/pos';

import { createTallyDatabase, type TallyDatabase } from './create-db';
import { startReplication } from './replication';

// A made-up key for tests only.
const KEY = 'pk_test_not_a_real_key_0123456789';
const priced: SyncContext = {
  connectorId: 'medusa', baseUrl: 'https://medusa.test', headers: { Authorization: 'Bearer admin_token' },
  pricingContext: { region_id: 'reg_eu', currency_code: 'eur', publishable_key: KEY },
};
// More than one pull batch (RxDB's default, 100), so the first sync pulls from a stored checkpoint.
const TOTAL = 150;
const stamp = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
const id = (n: number) => `prod_${String(n).padStart(4, '0')}`;
const SALE = id(5);

type Variant = { id: string; updated_at: string; prices: Array<{ id: string; currency_code: string; amount: number }> };
type Product = { id: string; handle: string; status: string; title: string; updated_at: string; variants: Variant[] };

/**
 * An in-memory Medusa, cut down from D2b's (`pricing/calculated.replication.test.ts`
 * in the Medusa connector): the admin product and variant listings, and
 * `/store/products`, which needs the publishable key and prices region
 * `reg_eu` in EUR, with one sale on SALE's first variant. It honours `id[]`,
 * `updated_at[$gte]`, `order`, `limit`, `offset` and the store `fields`.
 */
function world() {
  const products: Product[] = Array.from({ length: TOTAL }, (_, i) => {
    const n = i + 1;
    return {
      id: id(n), handle: `product-${n}`, status: 'published', title: `Product ${n}`, updated_at: stamp(n),
      variants: [1, 2].map((v) => ({ id: `${id(n)}-v${v}`, updated_at: stamp(n), prices: [{ id: `price_${id(n)}_v${v}`, currency_code: 'eur', amount: 10 * v }] })),
    };
  });
  // The store API sends more than MedusaCalculatedPrice declares (`id`, `original_price`).
  const calculatedPrice = (variant: Variant) => {
    const base = variant.prices[0];
    const sale = variant.id === `${SALE}-v1`;
    return {
      id: `pset_${variant.id}`, currency_code: 'eur', calculated_amount: sale ? 8 : base.amount, original_amount: base.amount,
      is_calculated_price_tax_inclusive: false, is_original_price_tax_inclusive: false,
      calculated_price: { id: `calc_${variant.id}`, price_list_id: sale ? 'plist_flash' : null, price_list_type: sale ? 'sale' : null },
      original_price: { id: base.id, price_list_id: null, price_list_type: null },
    };
  };

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const params = url.searchParams;
    const offset = Number(params.get('offset') ?? 0);
    const limit = Number(params.get('limit') ?? 20);
    const sort = params.get('order') === 'id' ? byId : (a: Product | Variant, b: Product | Variant) => b.updated_at.localeCompare(a.updated_at);
    const bound = params.get('updated_at[$gte]');
    const ids = params.getAll('id[]');

    if (url.pathname === '/store/products') {
      if ((init?.headers as Record<string, string>)['x-publishable-api-key'] !== KEY) return json({ message: 'A valid publishable key is required' }, 400);
      if (params.get('region_id') !== 'reg_eu') return json({ message: 'Region not found' }, 400);
      const rows = products.filter((p) => !ids.length || ids.includes(p.id)).sort(byId);
      const withPrices = (params.get('fields') ?? '').split(',').includes('*variants.calculated_price');
      const page = rows.slice(offset, offset + limit).map((p) => ({
        id: p.id, variants: p.variants.map((v) => ({ id: v.id, ...(withPrices ? { calculated_price: calculatedPrice(v) } : {}) })),
      }));
      return json({ products: page, count: rows.length, offset, limit });
    }
    if (url.pathname === '/admin/product-variants') {
      const variants = products.flatMap((p) => p.variants.map((v) => ({ ...v, product_id: p.id })))
        .filter((v) => !bound || v.updated_at >= bound).sort(sort);
      return json({ variants: variants.slice(offset, offset + limit), count: variants.length, offset, limit });
    }
    const matching = products.filter((p) => (!ids.length || ids.includes(p.id)) && (!bound || p.updated_at >= bound)).sort(sort);
    return json({ products: matching.slice(offset, offset + limit), count: matching.length, offset, limit });
  });
}

/** Medusa's products schema before backlog 44: version 0, `calculated_price` undeclared. */
function versionZeroSchema() {
  const schema: any = structuredClone(medusaProductSchema);
  delete schema.properties.variants.items.properties.calculated_price;
  return { ...schema, version: 0 };
}

const order: PosOrder = {
  id: 'order-1', commandId: 'command-1', createdAt: stamp(1), updatedAt: stamp(1), currency: 'EUR', pricesIncludeTax: false,
  subtotalMinor: 1000, discountMinor: 0, taxMinor: 0, totalMinor: 1000, syncStatus: 'pending', customer: null,
  lines: [{ id: 'line-1', productId: id(1), name: 'Product 1', sku: '', quantity: 1, unitPriceMinor: 1000, discountMinor: 0, netMinor: 1000, taxLines: [] }],
  payments: [{ id: 'payment-1', method: 'cash', amountMinor: 1000 }],
};

let db: TallyDatabase | undefined;
let replication: RxReplicationState<any, any> | undefined;
afterEach(async () => {
  await replication?.cancel();
  await db?.close();
  replication = undefined;
  db = undefined;
  vi.restoreAllMocks();
});

/** Opens `name` with `schema` as Medusa's products schema, and `pos_orders` as `@tallyui/pos` adds it. */
async function open(name: string, storage: unknown, schema: typeof medusaProductSchema) {
  const connector: TallyConnector = { ...medusaConnector, schemas: { products: schema } };
  db = await createTallyDatabase({ connector, name, storage });
  await db.addCollections({ pos_orders: { schema: posOrderSchema } });
  return db;
}

/** Medusa's combined pull, recording the checkpoint each call starts from. */
async function sync(database: TallyDatabase) {
  const checkpoints: unknown[] = [];
  const adapter = medusaConnector.replication!.products! as ReplicationAdapter<any, any>;
  replication = startReplication({
    collection: database.products, context: priced, retryTime: 10,
    adapter: { pull: { handler: (checkpoint, batchSize, context) => (checkpoints.push(checkpoint), adapter.pull.handler(checkpoint, batchSize, context)) } },
  });
  const errors: unknown[] = [];
  replication.error$.subscribe((error) => errors.push(error));
  await replication.awaitInSync();
  expect(errors).toEqual([]);
  return checkpoints;
}

describe('a connector schema bump drops and resyncs (backlog 44)', () => {
  it('reopening version 0 as version 1 empties products, pulls from no checkpoint, and refills them typed; local collections are kept', async () => {
    world();
    const storage = getRxStorageMemory();
    const name = `schemamigration${Date.now()}`;

    // 1-2. Version 0, synced, with a stored checkpoint, one stock_levels row and one order.
    const before = await open(name, storage, versionZeroSchema());
    const first = await sync(before);
    expect(first[0]).toBeUndefined();
    expect(first[1]).toMatchObject({ products: { offset: 100 } });
    expect(await before.products.count().exec()).toBe(TOTAL);
    await before.stock_levels.insert({ id: 'iitem_1', value: [{ stocked: 3 }], updatedAt: stamp(1) });
    await before.pos_orders.insert(order);
    const stockRow = (await before.stock_levels.findOne('iitem_1').exec())!.toJSON(true);
    const orderRow = (await before.pos_orders.findOne('order-1').exec())!.toJSON(true);
    await replication!.cancel();
    await before.close();

    // 3. The same name, version 1.
    const after = await open(name, storage, medusaProductSchema);
    expect(await after.products.count().exec()).toBe(0);
    const checkpoints = await sync(after);

    // 4. The first pull starts from nothing (the reset), and every product is back, typed.
    expect(checkpoints[0]).toBeUndefined();
    const docs = await after.products.find().exec();
    expect(docs).toHaveLength(TOTAL);
    for (const doc of docs) {
      for (const variant of doc.toJSON().variants) expect(variant.calculated_price, variant.id).toMatchObject({ currency_code: 'eur', calculated_amount: expect.any(Number) });
    }
    expect((after.products.schema.jsonSchema as any).properties.variants.items.properties.calculated_price).toBeDefined();
    expect((await after.products.findOne(SALE).exec())!.toJSON().variants[0].calculated_price)
      .toMatchObject({ calculated_amount: 8, original_amount: 10, calculated_price: { price_list_type: 'sale' } });

    // The local-only collections are untouched.
    expect((await after.stock_levels.findOne('iitem_1').exec())!.toJSON(true)).toEqual(stockRow);
    expect((await after.pos_orders.findOne('order-1').exec())!.toJSON(true)).toEqual(orderRow);
  }, 30000);

  it('version 1 validates calculated_price: full, null, and with an unknown field inside insert; a mistyped amount does not', async () => {
    const database = await open(`schemavalidate${Date.now()}`, getRxStorageMemory(), medusaProductSchema);
    const full = {
      calculated_amount: 8, original_amount: 10, currency_code: 'eur', is_calculated_price_tax_inclusive: false,
      is_original_price_tax_inclusive: false, calculated_price: { price_list_id: 'plist_flash', price_list_type: 'sale' },
    };
    const product = (n: number, calculated_price: unknown) => ({ id: id(n), handle: `product-${n}`, status: 'published', variants: [{ id: `${id(n)}-v1`, calculated_price }] });

    await database.products.insert(product(1, full));
    await database.products.insert(product(2, null));
    await database.products.insert(product(3, { ...full, id: 'pset_1', calculated_price: { ...full.calculated_price, id: 'calc_1' } }));
    expect(await database.products.count().exec()).toBe(3);
    await expect(database.products.insert(product(4, { ...full, calculated_amount: '8' }))).rejects.toThrow();
  });
});

// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { replicateRxCollection, type RxReplicationState } from 'rxdb/plugins/replication';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { vendureProductSchema } from '../schemas/products';
import { createVendureConnector } from '../index';
import type { VendureProductCheckpoint } from './products';

addRxPlugin(RxDBDevModePlugin);
const context = { connectorId: 'vendure', baseUrl: 'https://vendure.test', headers: {} };
const timestamp = (offset: number) => Date.UTC(2026, 0, 1) + offset;
type Product = { id: string; name: string; slug: string; updatedAt: number };
let db: RxDatabase;
let replication: RxReplicationState<any, VendureProductCheckpoint>;
let databaseNumber = 0;

afterEach(async () => {
  await replication?.cancel();
  await db?.close();
  vi.restoreAllMocks();
});

async function start(count: number, afterPage?: (products: Product[]) => void, tied = false,
  server: { skew?: number; updatedAtSkewMs?: number; fractionMs?: number } = {}) {
  const adapter = createVendureConnector({ updatedAtSkewMs: server.updatedAtSkewMs }).replication!.products!;
  const products = Array.from({ length: count }, (_, i) => ({
    id: String(i + 1), name: `Product ${i + 1}`, slug: `product-${i + 1}`,
    updatedAt: timestamp(tied ? 0 : i) + (server.fractionMs ?? 0),
  }));
  const requests: { skip: number; length: number; totalItems: number }[] = [];
  let hooked = false;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const { options } = JSON.parse(init!.body as string).variables;
    const after = options.filter?.updatedAt?.after;
    // Stored timestamps retain sub-ms precision; API output stays ms-truncated UTC.
    const matching = products.filter((p) => !after || p.updatedAt + (server.skew ?? 0) > Date.parse(after))
      .sort(options.sort.updatedAt === 'DESC'
        ? (a, b) => b.updatedAt - a.updatedAt
        : (a, b) => Number(a.id) - Number(b.id));
    const skip = options.skip ?? 0;
    const items = matching.slice(skip, skip + options.take)
      .map((p) => ({ ...p, createdAt: new Date(timestamp(0)).toISOString(), updatedAt: new Date(p.updatedAt).toISOString() }));
    const response = new Response(JSON.stringify({ data: { products: { items, totalItems: matching.length } } }));
    if (options.sort.id === 'ASC') {
      requests.push({ skip, length: items.length, totalItems: matching.length });
      if (!hooked && skip === 0) {
        hooked = true;
        afterPage?.(products);
      }
    }
    return response;
  });
  db = await createRxDatabase({
    name: `vendureproof${++databaseNumber}`, multiInstance: false,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
  });
  await db.addCollections({ products: { schema: vendureProductSchema } });
  replication = replicateRxCollection<any, VendureProductCheckpoint>({
    collection: db.products, replicationIdentifier: 'vendure-products-proof',
    live: true, waitForLeadership: false, retryTime: 10,
    pull: {
      batchSize: 1000,
      handler: (checkpoint, batchSize) => adapter.pull.handler(checkpoint, batchSize, context),
    },
  });
  await replication.awaitInSync();
  return { products, requests, afterNextPage: (callback: (rows: Product[]) => void) => {
    afterPage = callback;
    hooked = false;
  } };
}

async function expectUpdate(products: Product[], id = '5') {
  const product = products.find((p) => p.id === id)!;
  product.name = 'Updated product';
  product.updatedAt = timestamp(10000) + product.updatedAt % 1;
  replication.reSync();
  await replication.awaitInSync();
  const local = await db.products.findOne(id).exec();
  expect(local?.name).toBe(product.name);
  expect(local?.updatedAt).toBe(new Date(product.updatedAt).toISOString());
  expect(local!.toJSON()).not.toHaveProperty('createdAt');
}

describe('Vendure pull in the real RxDB replication loop', () => {
  it('delivers updates without warnings on an unskewed server with sub-ms timestamps', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { products } = await start(10, undefined, false, { fractionMs: 0.5 });
    expect(await db.products.find().exec()).toHaveLength(10);
    await expectUpdate(products);
    expect(warn).not.toHaveBeenCalled();
  });

  it('throws with both remedies when the server moves to UTC-2 before the second sync', async () => {
    const options = { skew: 0 };
    const { products } = await start(10, undefined, false, options);
    options.skew = -2 * 3600e3;
    Object.assign(products[4], { name: 'Updated product', updatedAt: timestamp(10000) });
    const failure = new Promise<any>((resolve) => {
      const subscription = replication.error$.subscribe((error) => {
        subscription.unsubscribe();
        resolve(error);
      });
    });
    replication.reSync();
    const error = await Promise.race([failure, replication.awaitInSync().then(() => undefined)]);
    expect(error?.parameters.errors[0].message).toMatch(/TZ=UTC.*updatedAtSkewMs/);
  });

  it.each([
    { skew: -2 * 3600e3, updatedAtSkewMs: 2 * 3600e3, warnings: 0 },
    { skew: 2 * 3600e3, updatedAtSkewMs: 0, warnings: 1 },
  ])('delivers updates with skew $skew and widening $updatedAtSkewMs', async (options) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { products } = await start(2500, undefined, false, options);
    expect(await db.products.find().exec()).toHaveLength(2500);
    expect(warn).toHaveBeenCalledTimes(options.warnings);
    await expectUpdate(products);
    expect(warn).toHaveBeenCalledTimes(options.warnings * 2);
    if (options.warnings) expect(warn).toHaveBeenLastCalledWith(expect.stringMatching(/over-fetch.*UTC/));
  });

  it('delivers updates without warnings when widening is set on an unskewed server', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { products } = await start(10, undefined, false, { skew: 0, updatedAtSkewMs: 2 * 3600e3 });
    await expectUpdate(products);
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn or probe on an unskewed idle poll', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await start(10);
    vi.mocked(globalThis.fetch).mockClear();
    replication.reSync();
    await replication.awaitInSync();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([2000, 2500])('syncs %i products and a later update', async (count) => {
    const { products } = await start(count);
    expect(await db.products.find().exec()).toHaveLength(count);
    await expectUpdate(products);
  });

  it('keeps both early and late updates made after page one', async () => {
    const { products } = await start(2500, (rows) => {
      for (const [id, offset] of [['5', 3000], ['2400', 4000]] as const) {
        Object.assign(rows.find((p) => p.id === id)!, { name: `Updated ${id}`, updatedAt: timestamp(offset) });
      }
    });
    replication.reSync();
    await replication.awaitInSync();
    expect(await db.products.find().exec()).toHaveLength(2500);
    for (const id of ['5', '2400']) {
      const local = await db.products.findOne(id).exec();
      expect(local?.name).toBe(`Updated ${id}`);
      expect(local?.updatedAt).toBe(new Date(products.find((p) => p.id === id)!.updatedAt).toISOString());
    }
  });

  it('keeps every surviving product after 600 already-read rows vanish mid-pass', async () => {
    const { products, requests } = await start(2500, (rows) => { rows.splice(0, 600); });
    const localIds = new Set((await db.products.find().exec()).map((p) => p.id));
    for (const product of products) expect(localIds.has(product.id), `Missing ${product.id}`).toBe(true);
    expect(requests).toContainEqual({ skip: 1000, length: 900, totalItems: 1900 });
    expect(requests).toContainEqual({ skip: 0, length: 1000, totalItems: 1900 });
    await expectUpdate(products, '605');
  });

  it('keeps every survivor current when a larger second pass loses already-read rows', async () => {
    const { products, requests, afterNextPage } = await start(1500, undefined, true);
    expect(await db.products.find().exec()).toHaveLength(1500);
    for (const product of products) {
      Object.assign(product, { name: `Updated ${product.id}`, updatedAt: timestamp(1500) });
    }
    products.push(...Array.from({ length: 500 }, (_, i) => ({
      id: String(1501 + i), name: `Product ${1501 + i}`, slug: `product-${1501 + i}`,
      updatedAt: timestamp(1501 + i),
    })));
    requests.length = 0;
    afterNextPage((rows) => { rows.splice(0, 300); });
    replication.reSync();
    await replication.awaitInSync();
    expect(products).toHaveLength(1700);
    const localNames = new Map((await db.products.find().exec()).map((p) => [p.id, p.name]));
    for (const product of products) expect(localNames.get(product.id), `Stale or missing ${product.id}`).toBe(product.name);
    expect(requests).toContainEqual({ skip: 0, length: 1000, totalItems: 2000 });
    expect(requests).toContainEqual({ skip: 1000, length: 700, totalItems: 1700 });
    expect(requests).toContainEqual({ skip: 0, length: 1000, totalItems: 1700 });
  });

  it('completes with 1500 tied timestamps and completes a later sync', async () => {
    const { products } = await start(1500, undefined, true);
    expect(await db.products.find().exec()).toHaveLength(1500);
    await expectUpdate(products);
  });
});

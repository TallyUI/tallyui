// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { replicateRxCollection, type RxReplicationState } from 'rxdb/plugins/replication';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { vendureProductSchema } from '../schemas/products';
import { vendureProductReplication, type VendureProductCheckpoint } from './products';

addRxPlugin(RxDBDevModePlugin);
const context = { connectorId: 'vendure', baseUrl: 'https://vendure.test', headers: {} };
const timestamp = (offset: number) => new Date(Date.UTC(2026, 0, 1) + offset).toISOString();
type Product = { id: string; name: string; slug: string; updatedAt: string };
let db: RxDatabase;
let replication: RxReplicationState<any, VendureProductCheckpoint>;
let databaseNumber = 0;

afterEach(async () => {
  await replication?.cancel();
  await db?.close();
  vi.restoreAllMocks();
});

async function start(count: number, afterPage?: (products: Product[]) => void, tied = false) {
  const products = Array.from({ length: count }, (_, i) => ({
    id: String(i + 1), name: `Product ${i + 1}`, slug: `product-${i + 1}`,
    updatedAt: timestamp(tied ? 0 : i),
  }));
  const requests: { skip: number; length: number; totalItems: number }[] = [];
  let hooked = false;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const { options } = JSON.parse(init!.body as string).variables;
    const after = options.filter?.updatedAt?.after;
    const matching = products.filter((p) => !after || Date.parse(p.updatedAt) > Date.parse(after))
      .sort(options.sort.updatedAt === 'DESC'
        ? (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
        : (a, b) => Number(a.id) - Number(b.id));
    const skip = options.skip ?? 0;
    const items = matching.slice(skip, skip + options.take);
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
    live: true, waitForLeadership: false,
    pull: {
      batchSize: 1000,
      handler: (checkpoint, batchSize) => vendureProductReplication.pull.handler(checkpoint, batchSize, context),
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
  product.updatedAt = timestamp(10000);
  replication.reSync();
  await replication.awaitInSync();
  const local = await db.products.findOne(id).exec();
  expect(local?.name).toBe(product.name);
  expect(local?.updatedAt).toBe(product.updatedAt);
}

describe('Vendure pull in the real RxDB replication loop', () => {
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
      expect(local?.updatedAt).toBe(products.find((p) => p.id === id)!.updatedAt);
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

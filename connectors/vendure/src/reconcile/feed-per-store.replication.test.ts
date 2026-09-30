// @vitest-environment node
// #307: createVendureConnector() builds its reconcile feed per instance. A store switch, or a second store, in one
// runtime never carries one store's queued refetches or tombstones into another's database.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { replicateRxCollection } from 'rxdb/plugins/replication';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { connectorCollection } from '@tallyui/database';
import { vendureProductSchema } from '../schemas/products';
import { createVendureConnector } from '../index';

addRxPlugin(RxDBDevModePlugin);
const iso = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 1000 + 0.5).toISOString();
type Product = { id: string; name: string; updatedAt: string; variants: Array<{ id: string }> };

// Fake Vendure stores by host: the product and variant queries, by date or by id (filter.id.in).
const stores = new Map<string, { products: Product[]; idRequests: string[][] }>();
const closes: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
  stores.clear();
  vi.restoreAllMocks();
});

function serve() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const store = stores.get(new URL(String(input)).host)!;
    const { query, variables: { options } } = JSON.parse(init!.body as string);
    const ids: string[] | undefined = options.filter?.id?.in;
    if (ids) store.idRequests.push(ids);
    const after = options.filter?.updatedAt?.after;
    const skip = options.skip ?? 0;
    const newest = options.sort?.updatedAt === 'DESC';
    const order = <T extends { id: string; updatedAt: string }>(rows: T[]) => rows
      .filter((r) => !after || Date.parse(r.updatedAt) > Date.parse(after))
      .sort(newest ? (a, b) => b.updatedAt.localeCompare(a.updatedAt) : (a, b) => Number(a.id) - Number(b.id));
    if (query.includes('productVariants')) {
      const variants = order(store.products.flatMap((p) => p.variants.map((v) => ({ id: v.id, productId: p.id, updatedAt: p.updatedAt }))));
      return Response.json({ data: { productVariants: { items: variants.slice(skip, skip + options.take), totalItems: variants.length } } });
    }
    const products = order(store.products.filter((p) => !ids || ids.includes(p.id)));
    return Response.json({ data: { products: { items: products.slice(skip, skip + options.take), totalItems: products.length } } });
  });
}

/** A store at `host` with four products, ids from `first`, and a till replicating it through a new connector instance. */
async function tillAt(host: string, first: number) {
  const products = Array.from({ length: 4 }, (_, i): Product => ({
    id: String(first + i), name: `Product ${first + i}`, updatedAt: iso(i + 1), variants: [{ id: String(10 * (first + i)) }],
  }));
  const store = { products, idRequests: [] as string[][] };
  stores.set(host, store);
  serve();
  const db = await createRxDatabase({
    name: `vendurefeed${Math.random().toString(36).slice(2)}`, multiInstance: false, storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
  });
  closes.push(() => db.close());
  await db.addCollections({ products: connectorCollection(vendureProductSchema) });
  const connector = createVendureConnector();
  const context = { connectorId: 'vendure', baseUrl: `https://${host}`, headers: {} };
  const state = replicateRxCollection<any, any>({
    collection: db.products, replicationIdentifier: 'vendure-feed-per-store', live: true, waitForLeadership: false, retryTime: 10,
    pull: { batchSize: 100, handler: (checkpoint, batchSize) => connector.replication!.products!.pull.handler(checkpoint, batchSize, context) },
  });
  closes.push(() => state.cancel());
  await state.awaitInSync();
  const docs = (await db.products.find().exec()).map((d: any) => d.toJSON());
  expect(docs).toHaveLength(4);
  return { store, db, state, connector, docs };
}
type Till = Awaited<ReturnType<typeof tillAt>>;

/** Queues, undrained, every product through the instance's id reconcile adapter: a refetch, or a tombstone once gone. */
const queueWork = (till: Till) => till.connector.reconcile!.ids!.enqueue(till.docs.map((local) => ({ id: local.id, local })));

/** What of `docs` reached `till`: documents with their ids (tombstones included), and by-id requests to its store for them. */
async function leaked(till: Till, docs: Array<{ id: string }>) {
  const ids = docs.map((d) => d.id);
  const found = await till.db.products.storageInstance.findDocumentsById(ids, true);
  return { documents: found.map((d: any) => d.id), requests: till.store.idRequests.filter((asked) => asked.some((id) => ids.includes(id))).length };
}

describe('Vendure: one reconcile feed per store session (#307)', () => {
  it('a store switch with createVendureConnector(): nothing of A reaches B\'s database or B\'s store', async () => {
    const a = await tillAt('a.test', 1);
    queueWork(a);
    await a.state.cancel();
    const b = await tillAt('b.test', 101);
    expect(await leaked(b, a.docs)).toEqual({ documents: [], requests: 0 });
  });

  it('two stores at once, one instance each: each queue reaches only its own store and database', async () => {
    const a = await tillAt('a.test', 1);
    const b = await tillAt('b.test', 101);
    for (const store of [a.store, b.store]) {
      store.products[0].name = 'Edited'; // no updatedAt bump: only the refetch brings it
      store.products.pop(); // gone: the refetch finds nothing, so the queued entry is a tombstone
    }
    queueWork(a);
    queueWork(b);
    await Promise.all([a, b].map(async (till) => { till.state.reSync(); await till.state.awaitInSync(); }));

    expect(await leaked(b, a.docs)).toEqual({ documents: [], requests: 0 });
    expect(await leaked(a, b.docs)).toEqual({ documents: [], requests: 0 });
    for (const [till, first] of [[a, 1], [b, 101]] as const) {
      expect((await till.db.products.findOne(String(first)).exec())?.name).toBe('Edited');
      expect(await till.db.products.findOne(String(first + 3)).exec()).toBeNull();
    }
  });
});

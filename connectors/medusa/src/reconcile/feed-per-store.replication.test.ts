// @vitest-environment node
// #307: one reconcile feed per store session, for both Medusa connectors (secret key and admin user). A store switch,
// or a second store, in one runtime never carries one store's queued refetches or tombstones into another's database.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { replicateRxCollection } from 'rxdb/plugins/replication';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { TallyConnector } from '@tallyui/core';
import { connectorCollection } from '@tallyui/database';
import { medusaProductSchema } from '../schemas/products';
import { createMedusaAdminUserConnector, createMedusaConnector, medusaAdminUserConnector, medusaConnector } from '../index';

addRxPlugin(RxDBDevModePlugin);
const stamp = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
type Product = { id: string; handle: string; status: string; title: string; updated_at: string; variants: Array<{ id: string; updated_at: string }> };

// Fake Medusa stores by host: the mark checks, the product and variant listings, and the by-id re-read (id[]).
const stores = new Map<string, { products: Product[]; requests: URLSearchParams[] }>();
const closes: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
  stores.clear();
  vi.restoreAllMocks();
});

function serve() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input));
    const store = stores.get(url.host)!;
    const params = url.searchParams;
    store.requests.push(params);
    const [offset, limit, order, bound, ids] = [Number(params.get('offset') ?? 0), Number(params.get('limit') ?? 20),
      params.get('order'), params.get('updated_at[$gte]'), params.getAll('id[]')];
    const sort = <T extends { id: string; updated_at: string }>(rows: T[]) => [...rows].sort(order === 'id'
      ? (a, b) => a.id.localeCompare(b.id) : (a, b) => b.updated_at.localeCompare(a.updated_at));
    if (url.pathname === '/admin/product-variants') {
      const variants = sort(store.products.flatMap((p) => p.variants.map((v) => ({ ...v, product_id: p.id }))))
        .filter((v) => !bound || v.updated_at >= bound);
      return Response.json({ variants: variants.slice(offset, offset + limit), count: variants.length, offset, limit });
    }
    const matching = sort(store.products.filter((p) => (!ids.length || ids.includes(p.id)) && (!bound || p.updated_at >= bound)));
    return Response.json({ products: matching.slice(offset, offset + limit), count: matching.length, offset, limit });
  });
}

/** A store at `host` with four products `<prefix>_prod_<n>`, and a till replicating it through `connector`'s combined pull. */
async function tillAt(host: string, prefix: string, connector: TallyConnector) {
  const products = Array.from({ length: 4 }, (_, i): Product => ({
    id: `${prefix}_prod_${i + 1}`, handle: `${prefix}-${i + 1}`, status: 'published', title: `Product ${i + 1}`, updated_at: stamp(i + 1),
    variants: [{ id: `${prefix}_variant_${i + 1}`, updated_at: stamp(i + 1) }],
  }));
  const store = { products, requests: [] as URLSearchParams[] };
  stores.set(host, store);
  serve();
  const db = await createRxDatabase({
    name: `medusafeed${Math.random().toString(36).slice(2)}`, multiInstance: false, storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
  });
  closes.push(() => db.close());
  await db.addCollections({ products: connectorCollection(medusaProductSchema) });
  const context = { connectorId: 'medusa', baseUrl: `https://${host}`, headers: {} };
  const state = replicateRxCollection<any, any>({
    collection: db.products, replicationIdentifier: 'medusa-feed-per-store', live: true, waitForLeadership: false, retryTime: 10,
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

/** What of `docs` reached `till`: documents with their ids (tombstones included), and requests to its store for them. */
async function leaked(till: Till, docs: Array<{ id: string }>) {
  const ids = docs.map((d) => d.id);
  const found = await till.db.products.storageInstance.findDocumentsById(ids, true);
  const requests = till.store.requests.filter((params) => params.getAll('id[]').some((id) => ids.includes(id)));
  return { documents: found.map((d: any) => d.id).sort(), requests: requests.length };
}

/** Store A's till queues work and is cancelled; store B's till, on a new database, then syncs. */
async function storeSwitch(connectorFor: () => TallyConnector) {
  const a = await tillAt('a.test', 'a', connectorFor());
  queueWork(a);
  await a.state.cancel();
  const b = await tillAt('b.test', 'b', connectorFor());
  return leaked(b, a.docs);
}

/**
 * The worst case (#307): two stores with the same product and variant ids. Product 1 goes from store A, and A's till
 * queues every product for its id reconcile (drained against A, the entry for product 1 is a tombstone) and is
 * cancelled with that work queued. Store B's till, on a new database, then syncs; B's product 1 is live. What became
 * of B's product 1, and how many by-id re-reads B's store answered: B's own queue is empty, so every one came from A's.
 */
async function sharedIdSwitch(connectorFor: () => TallyConnector) {
  const a = await tillAt('a.test', 'p', connectorFor());
  a.store.products.shift();
  queueWork(a);
  await a.state.cancel();
  const b = await tillAt('b.test', 'p', connectorFor());
  expect(b.store.products[0]).toMatchObject({ id: 'p_prod_1', status: 'published' });
  const [product1] = await b.db.products.storageInstance.findDocumentsById(['p_prod_1'], true);
  return {
    product1: product1 && { id: product1.id, deleted: product1._deleted },
    requests: b.store.requests.filter((params) => params.has('id[]')).length,
  };
}

describe.each([
  ['secret key', medusaConnector, createMedusaConnector],
  ['admin user', medusaAdminUserConnector, createMedusaAdminUserConnector],
] as const)('Medusa (%s): one reconcile feed per store session (#307)', (_name, staticExport, factory) => {
  it('the deprecated static export leaks on a store switch: B gets A\'s tombstones and is asked for A\'s ids', async () => {
    const leak = await storeSwitch(() => staticExport);
    expect(leak.documents).toEqual(['a_prod_1', 'a_prod_2', 'a_prod_3', 'a_prod_4']);
    expect(leak.requests).toBeGreaterThan(0);
  });

  it('a store switch with the factory: nothing of A reaches B\'s database or B\'s store', async () => {
    expect(await storeSwitch(factory)).toEqual({ documents: [], requests: 0 });
  });

  it('the deprecated static export, stores with the same ids: B\'s store is asked for A\'s queued ids', async () => {
    // The id reconcile decides a tombstone when the queue drains, against the store it drains into: B's re-read finds
    // B's own product 1, so it survives here (unlike WooCommerce's proven tombstones), but A's queue reached B's store.
    expect(await sharedIdSwitch(() => staticExport)).toEqual({ product1: { id: 'p_prod_1', deleted: false }, requests: 1 });
  });

  it('a store switch with the factory, stores with the same ids: B\'s product 1 stays live, B\'s store gets nothing of A\'s queue', async () => {
    expect(await sharedIdSwitch(factory)).toEqual({ product1: { id: 'p_prod_1', deleted: false }, requests: 0 });
  });

  it('two stores at once, one instance each: each queue reaches only its own store and database', async () => {
    const a = await tillAt('a.test', 'a', factory());
    const b = await tillAt('b.test', 'b', factory());
    for (const store of [a.store, b.store]) {
      store.products[0].title = 'Edited'; // no updated_at bump: only the refetch brings it
      store.products.pop(); // gone: the refetch finds nothing, so the queued entry is a tombstone
    }
    queueWork(a);
    queueWork(b);
    await Promise.all([a, b].map(async (till) => { till.state.reSync(); await till.state.awaitInSync(); }));

    expect(await leaked(b, a.docs)).toEqual({ documents: [], requests: 0 });
    expect(await leaked(a, b.docs)).toEqual({ documents: [], requests: 0 });
    for (const [till, prefix] of [[a, 'a'], [b, 'b']] as const) {
      expect((await till.db.products.findOne(`${prefix}_prod_1`).exec())?.title).toBe('Edited');
      expect(await till.db.products.findOne(`${prefix}_prod_4`).exec()).toBeNull();
    }
  });
});

it('the two Medusa factories build separate feeds: queueing into one never reaches the other', async () => {
  const a = await tillAt('a.test', 'a', createMedusaConnector());
  queueWork(a);
  await a.state.cancel();
  const b = await tillAt('b.test', 'b', createMedusaAdminUserConnector());
  expect(await leaked(b, a.docs)).toEqual({ documents: [], requests: 0 });
});

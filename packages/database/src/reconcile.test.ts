import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRxDatabase, addRxPlugin } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';

import { startStockReconcile } from './reconcile';
import type { StockReconcileAdapter, SyncContext } from '@tallyui/core';

addRxPlugin(RxDBDevModePlugin);

const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });

const schema = {
  version: 0,
  primaryKey: 'id',
  type: 'object' as const,
  properties: {
    id: { type: 'string', maxLength: 100 },
    variants: {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'string' }, stock: { type: 'number' }, price: { type: 'number' } } },
    },
  },
  required: ['id'],
};

type Doc = { id: string; variants: Array<{ id: string; stock: number; price?: number }> };

const context: SyncContext = { connectorId: 'test', baseUrl: 'https://example.com', headers: {} };

/** Fake adapter keyed by variant id; fetchPages yields the given pages, then throws `fail` if set. */
function fakeAdapter(pages: Array<Record<string, number>>, fail?: Error) {
  const fetchPages = vi.fn(async function* () {
    for (const page of pages) yield new Map(Object.entries(page));
    if (fail) throw fail;
  });
  const adapter: StockReconcileAdapter<Doc> = {
    fetchPages,
    patch(doc, stock) {
      if (!doc.variants.some((v) => stock.has(v.id) && stock.get(v.id) !== v.stock)) return undefined;
      return { variants: doc.variants.map((v) => (stock.has(v.id) ? { ...v, stock: stock.get(v.id) as number } : v)) };
    },
  };
  return { adapter, fetchPages };
}

describe('startStockReconcile', () => {
  let db: any;

  beforeEach(async () => {
    db = await createRxDatabase({ name: `reconcile_${Date.now()}`, storage, multiInstance: false, ignoreDuplicate: true });
    await db.addCollections({ products: { schema } });
    await db.products.bulkInsert([
      { id: 'p1', variants: [{ id: 'v1', stock: 5 }, { id: 'v2', stock: 3 }] },
      { id: 'p2', variants: [{ id: 'v3', stock: 7 }] },
    ]);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await db?.close();
  });

  const snapshot = async () => Object.fromEntries(
    (await db.products.find().exec()).map((d: any) => [d.id, { rev: d.revision, variants: d.toJSON().variants }]),
  );

  it('patches only documents whose stock differs', async () => {
    const before = await snapshot();
    const { adapter } = fakeAdapter([{ v1: 5, v2: 1 }, { v3: 7 }]);
    const { reconcileStock, stop } = startStockReconcile({ collection: db.products, adapter, context });

    expect(await reconcileStock()).toEqual({ pages: 2, patched: 1, truncated: false });
    const after = await snapshot();
    expect(after.p1.variants).toEqual([{ id: 'v1', stock: 5 }, { id: 'v2', stock: 1 }]);
    expect(after.p1.rev).not.toBe(before.p1.rev);
    expect(after.p2.rev).toBe(before.p2.rev);
    stop();
  });

  it('keeps a fresher write made between the fetch and the patch', async () => {
    const { adapter } = fakeAdapter([{ v1: 5, v2: 1 }]);
    // Replication writes a new price after the candidates' snapshots are read.
    const collection = { find: () => ({ exec: async () => {
      const docs = await db.products.find().exec();
      await (await db.products.findOne('p1').exec()).incrementalPatch({
        variants: [{ id: 'v1', stock: 5, price: 250 }, { id: 'v2', stock: 3 }],
      });
      return docs;
    } }) } as any;
    const { reconcileStock, stop } = startStockReconcile({ collection, adapter, context });

    expect(await reconcileStock()).toEqual({ pages: 1, patched: 1, truncated: false });
    expect((await snapshot()).p1.variants).toEqual([{ id: 'v1', stock: 5, price: 250 }, { id: 'v2', stock: 1 }]);
    stop();
  });

  it('shares one pass between concurrent calls', async () => {
    const { adapter, fetchPages } = fakeAdapter([{ v1: 9 }]);
    const { reconcileStock, stop } = startStockReconcile({ collection: db.products, adapter, context });

    const [a, b] = await Promise.all([reconcileStock(), reconcileStock()]);
    expect(a).toEqual({ pages: 1, patched: 1, truncated: false });
    expect(b).toBe(a);
    expect(fetchPages).toHaveBeenCalledTimes(1);
    stop();
  });

  it('patches nothing when fetchPages throws after page 1', async () => {
    const before = await snapshot();
    const { adapter } = fakeAdapter([{ v1: 0, v3: 0 }], new Error('network down'));
    const { reconcileStock, stop } = startStockReconcile({ collection: db.products, adapter, context });

    await expect(reconcileStock()).rejects.toThrow('network down');
    expect(await snapshot()).toEqual(before);
    stop();
  });

  it('truncates and patches nothing beyond maxPages', async () => {
    const before = await snapshot();
    const { adapter } = fakeAdapter([{ v1: 0 }, { v2: 0 }, { v3: 0 }]);
    const { reconcileStock, stop } = startStockReconcile({ collection: db.products, adapter, context, maxPages: 2 });

    expect(await reconcileStock()).toEqual({ pages: 2, patched: 0, truncated: true });
    expect(await snapshot()).toEqual(before);
    stop();
  });

  it('runs a pass every intervalMs, not before, and none after stop()', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { adapter, fetchPages } = fakeAdapter([{ v1: 1 }]);
    const { stop } = startStockReconcile({ collection: db.products, adapter, context, intervalMs: 1000 });

    vi.advanceTimersByTime(999);
    expect(fetchPages).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fetchPages).toHaveBeenCalledTimes(1);
    await vi.waitFor(async () => expect((await snapshot()).p1.variants[0].stock).toBe(1));
    stop();
    vi.advanceTimersByTime(5000);
    expect(fetchPages).toHaveBeenCalledTimes(1);
  });
});

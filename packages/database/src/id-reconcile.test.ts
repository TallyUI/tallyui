import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRxDatabase, addRxPlugin } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';

import { startIdReconcile } from './id-reconcile';
import type { IdReconcileAdapter, SyncContext } from '@tallyui/core';

addRxPlugin(RxDBDevModePlugin);

const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
const context: SyncContext = { connectorId: 'test', baseUrl: 'https://example.com', headers: {} };
const productSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object' as const,
  properties: {
    id: { type: 'string', maxLength: 100 },
    variants: {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'string' } } },
    },
  },
  required: ['id'],
};
type Doc = { id: string; variants: Array<{ id: string }> };

/** Fake adapter; fetchPages yields the given pages, then throws `fail` if set. */
function fakeAdapter(pages: Array<Array<{ id: string; variantIds: string[] }>>, fail?: Error) {
  const enqueue = vi.fn();
  const fetchPages = vi.fn(async function* (_ctx: SyncContext) {
    for (const page of pages) yield page;
    if (fail) throw fail;
  });
  const adapter: IdReconcileAdapter<Doc> = {
    fetchPages,
    variantIds: (doc) => (doc.variants ?? []).map((v) => v.id),
    enqueue,
  };
  return { adapter, fetchPages, enqueue };
}

describe('startIdReconcile', () => {
  let db: any;

  beforeEach(async () => {
    db = await createRxDatabase({ name: `id_reconcile_${Math.random().toString(36).slice(2)}`, storage, multiInstance: false });
    await db.addCollections({ products: { schema: productSchema } });
    await db.products.bulkInsert([
      { id: 'p1', variants: [{ id: 'v1' }, { id: 'v2' }] }, // matches remote
      { id: 'p2', variants: [{ id: 'v3' }] }, // missing from remote entirely
      { id: 'p3', variants: [{ id: 'v4' }, { id: 'v5' }] }, // v5 vanished remotely
    ]);
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await db?.close();
  });

  const revisions = async () => Object.fromEntries(
    (await db.products.find().exec()).map((d: any) => [d.id, d.revision]),
  );
  const start = (adapter: IdReconcileAdapter<Doc>, reSync: () => void, options: { startDelayMs?: number | null; intervalMs?: number; maxPages?: number } = {}) =>
    startIdReconcile({ collection: db.products, adapter, context, reSync, startDelayMs: null, ...options });

  it('queues products missing remotely or listing a vanished variant, and calls reSync once', async () => {
    const before = await revisions();
    const { adapter, enqueue } = fakeAdapter([[
      { id: 'p1', variantIds: ['v1', 'v2'] },
      { id: 'p3', variantIds: ['v4'] },
    ]]);
    const reSync = vi.fn();
    const { reconcileIds, stop } = start(adapter, reSync);

    const result = await reconcileIds();
    expect(result).toEqual({ pages: 1, queued: 2, truncated: false });
    expect(enqueue).toHaveBeenCalledTimes(1);
    const [entries] = enqueue.mock.calls[0];
    expect(new Set(entries.map((e: any) => e.id))).toEqual(new Set(['p2', 'p3']));
    expect(entries.find((e: any) => e.id === 'p2').local).toEqual({ id: 'p2', variants: [{ id: 'v3' }] });
    expect(reSync).toHaveBeenCalledTimes(1);
    expect(await revisions()).toEqual(before); // never writes the collection
    stop();
  });

  it('queues nothing and skips reSync when fetchPages throws after page 1', async () => {
    const before = await revisions();
    const { adapter, enqueue } = fakeAdapter([[{ id: 'p1', variantIds: ['v1', 'v2'] }]], new Error('network down'));
    const reSync = vi.fn();
    const { reconcileIds, stop } = start(adapter, reSync);

    await expect(reconcileIds()).rejects.toThrow('network down');
    expect(enqueue).not.toHaveBeenCalled();
    expect(reSync).not.toHaveBeenCalled();
    expect(await revisions()).toEqual(before);
    stop();
  });

  it('truncates, warns and queues nothing beyond maxPages', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { adapter, enqueue } = fakeAdapter([
      [{ id: 'p1', variantIds: ['v1', 'v2'] }],
      [{ id: 'p3', variantIds: ['v4', 'v5'] }],
    ]);
    const reSync = vi.fn();
    const { reconcileIds, stop } = start(adapter, reSync, { maxPages: 1 });

    expect(await reconcileIds()).toEqual({ pages: 1, queued: 0, truncated: true });
    expect(enqueue).not.toHaveBeenCalled();
    expect(reSync).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/1-page limit.*nothing was queued/));
    stop();
  });

  it('stop() aborts a pass waiting inside fetchPages and queues nothing', async () => {
    let received: AbortSignal | undefined;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const enqueue = vi.fn();
    const adapter: IdReconcileAdapter<Doc> = {
      async *fetchPages(ctx) {
        received = ctx.signal;
        yield [{ id: 'p1', variantIds: ['v1', 'v2'] }];
        await gate;
        yield [{ id: 'p3', variantIds: ['v4', 'v5'] }];
      },
      variantIds: (doc) => (doc.variants ?? []).map((v) => v.id),
      enqueue,
    };
    const reSync = vi.fn();
    const { reconcileIds, stop } = start(adapter, reSync);

    const pass = reconcileIds();
    await vi.waitFor(() => expect(received).toBeDefined());
    stop();
    expect(received!.aborted).toBe(true);
    release();
    await expect(pass).rejects.toThrow();
    expect(enqueue).not.toHaveBeenCalled();
    expect(reSync).not.toHaveBeenCalled();
  });

  it('rejects without calling fetchPages after stop()', async () => {
    const { adapter, fetchPages } = fakeAdapter([[]]);
    const { reconcileIds, stop } = start(adapter, vi.fn());
    stop();
    await expect(reconcileIds()).rejects.toThrow();
    expect(fetchPages).not.toHaveBeenCalled();
  });

  it('shares one pass between concurrent calls', async () => {
    const { adapter, fetchPages } = fakeAdapter([[{ id: 'p1', variantIds: ['v1', 'v2'] }]]);
    const { reconcileIds, stop } = start(adapter, vi.fn());

    const [a, b] = await Promise.all([reconcileIds(), reconcileIds()]);
    expect(b).toBe(a);
    expect(fetchPages).toHaveBeenCalledTimes(1);
    stop();
  });

  it('runs a pass at startDelayMs, the next at startDelayMs + intervalMs, and none after stop()', async () => {
    vi.useFakeTimers();
    const { adapter, fetchPages } = fakeAdapter([[]]);
    const { stop } = startIdReconcile({
      collection: db.products, adapter, context, reSync: vi.fn(), startDelayMs: 1000, intervalMs: 5000,
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(fetchPages).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchPages).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4999);
    expect(fetchPages).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchPages).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(20000);
    expect(fetchPages).toHaveBeenCalledTimes(2);
  });

  it('startDelayMs: null skips the start pass but keeps the nightly cadence', async () => {
    vi.useFakeTimers();
    const { adapter, fetchPages } = fakeAdapter([[]]);
    const { stop } = startIdReconcile({
      collection: db.products, adapter, context, reSync: vi.fn(), startDelayMs: null, intervalMs: 5000,
    });

    await vi.advanceTimersByTimeAsync(4999);
    expect(fetchPages).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchPages).toHaveBeenCalledTimes(1);
    stop();
  });
});

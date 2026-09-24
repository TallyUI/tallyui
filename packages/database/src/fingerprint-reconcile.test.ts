import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRxDatabase, addRxPlugin } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';

import { startFingerprintReconcile, type FingerprintReconcileState } from './fingerprint-reconcile';
import type { FingerprintReconcileAdapter, SyncContext } from '@tallyui/core';

addRxPlugin(RxDBDevModePlugin);

const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
const context: SyncContext = { connectorId: 'test', baseUrl: 'https://example.com', headers: {} };
const productSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object' as const,
  properties: {
    id: { type: 'string', maxLength: 100 },
    price: { type: 'string' },
  },
  required: ['id'],
};
type Doc = { id: string; price: string };

/** Fake adapter; fetchPages yields the given pages (id -> fingerprint), then throws `fail` if set. */
function fakeAdapter(pages: Array<Record<string, string>>, fail?: Error) {
  const enqueue = vi.fn();
  const fetchPages = vi.fn(async function* (_ctx: SyncContext) {
    for (const page of pages) yield new Map(Object.entries(page));
    if (fail) throw fail;
  });
  const adapter: FingerprintReconcileAdapter<Doc> = { fetchPages, fingerprint: (doc) => doc.price, enqueue };
  return { adapter, fetchPages, enqueue };
}

describe('startFingerprintReconcile', () => {
  let db: any;

  beforeEach(async () => {
    db = await createRxDatabase({ name: `fingerprint_reconcile_${Math.random().toString(36).slice(2)}`, storage, multiInstance: false });
    await db.addCollections({ products: { schema: productSchema } });
    await db.products.bulkInsert([
      { id: 'p1', price: '10' }, // matches remote
      { id: 'p2', price: '20' }, // mismatched
      { id: 'p3', price: '30' }, // remote doesn't report it
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
  const start = (adapter: FingerprintReconcileAdapter<Doc>, reSync: () => void, options: { startDelayMs?: number | null; intervalMs?: number; maxPages?: number } = {}) =>
    startFingerprintReconcile({ collection: db.products, adapter, context, reSync, ...options });

  it('queues exactly the mismatched products, skips ones the remote side does not report, and calls reSync once', async () => {
    const before = await revisions();
    const { adapter, enqueue } = fakeAdapter([{ p1: '10', p2: '99' }]);
    const reSync = vi.fn();
    const { reconcile, stop } = start(adapter, reSync);

    const result = await reconcile();
    expect(result).toEqual({ pages: 1, compared: 2, queued: 1, truncated: false, unreported: 1 });
    expect(enqueue).toHaveBeenCalledTimes(1);
    const [entries] = enqueue.mock.calls[0];
    expect(entries).toEqual([{ id: 'p2', local: { id: 'p2', price: '20' } }]);
    expect(reSync).toHaveBeenCalledTimes(1);
    expect(await revisions()).toEqual(before); // never writes the collection
    stop();
  });

  it('skips reSync, and enqueue, when nothing is mismatched', async () => {
    const { adapter, enqueue } = fakeAdapter([{ p1: '10', p2: '20' }]);
    const reSync = vi.fn();
    const { reconcile, stop } = start(adapter, reSync);

    expect(await reconcile()).toEqual({ pages: 1, compared: 2, queued: 0, truncated: false, unreported: 1 });
    expect(enqueue).not.toHaveBeenCalled();
    expect(reSync).not.toHaveBeenCalled();
    stop();
  });

  it('queues nothing and skips reSync when fetchPages throws after page 1', async () => {
    const before = await revisions();
    const { adapter, enqueue } = fakeAdapter([{ p1: '10' }], new Error('network down'));
    const reSync = vi.fn();
    const { reconcile, stop } = start(adapter, reSync);

    await expect(reconcile()).rejects.toThrow('network down');
    expect(enqueue).not.toHaveBeenCalled();
    expect(reSync).not.toHaveBeenCalled();
    expect(await revisions()).toEqual(before);
    stop();
  });

  it('counts local products the remote side did not report: 3 of 10 gives unreported 3', async () => {
    await db.products.bulkInsert(Array.from({ length: 7 }, (_, i) => ({ id: `q${i}`, price: '1' })));
    // Local: p1-p3 and q0-q6. Remote reports q0-q6 only, so p1, p2 and p3 are unreported.
    const { adapter } = fakeAdapter([Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`q${i}`, '1']))]);
    const { reconcile, stop } = start(adapter, vi.fn());

    expect(await reconcile()).toEqual({ pages: 1, compared: 7, queued: 0, truncated: false, unreported: 3 });
    stop();
  });

  it('an adapter that yields no pages gives unreported: 0, not the whole catalogue', async () => {
    const { adapter } = fakeAdapter([]);
    const { reconcile, stop } = start(adapter, vi.fn());

    expect(await reconcile()).toEqual({ pages: 0, compared: 0, queued: 0, truncated: false, unreported: 0 });
    stop();
  });

  it('an adapter that yields a single empty page reports every local product as unreported', async () => {
    await db.products.bulkInsert(Array.from({ length: 7 }, (_, i) => ({ id: `q${i}`, price: '1' })));
    // Local: p1-p3 and q0-q6, 10 products. Remote reads one (empty) page, so all 10 are unreported.
    const { adapter } = fakeAdapter([{}]);
    const { reconcile, stop } = start(adapter, vi.fn());

    expect(await reconcile()).toEqual({ pages: 1, compared: 0, queued: 0, truncated: false, unreported: 10 });
    stop();
  });

  it('truncates, warns and queues nothing beyond maxPages', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = await revisions();
    const { adapter, enqueue } = fakeAdapter([{ p1: '10' }, { p2: '99' }]);
    const reSync = vi.fn();
    const { reconcile, stop } = start(adapter, reSync, { maxPages: 1 });

    expect(await reconcile()).toEqual({ pages: 1, compared: 0, queued: 0, truncated: true, unreported: 0 });
    expect(enqueue).not.toHaveBeenCalled();
    expect(reSync).not.toHaveBeenCalled();
    expect(await revisions()).toEqual(before);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/1-page limit.*nothing was queued/));
    stop();
  });

  it('stop() aborts a pass waiting inside fetchPages and queues nothing', async () => {
    let received: AbortSignal | undefined;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const enqueue = vi.fn();
    const adapter: FingerprintReconcileAdapter<Doc> = {
      async *fetchPages(ctx) {
        received = ctx.signal;
        yield new Map([['p1', '10']]);
        await gate;
        yield new Map([['p2', '99']]);
      },
      fingerprint: (doc) => doc.price,
      enqueue,
    };
    const reSync = vi.fn();
    const { reconcile, stop } = start(adapter, reSync);

    const pass = reconcile();
    await vi.waitFor(() => expect(received).toBeDefined());
    stop();
    expect(received!.aborted).toBe(true);
    release();
    await expect(pass).rejects.toThrow();
    expect(enqueue).not.toHaveBeenCalled();
    expect(reSync).not.toHaveBeenCalled();
  });

  it('rejects without calling fetchPages after stop()', async () => {
    const { adapter, fetchPages } = fakeAdapter([{}]);
    const { reconcile, stop } = start(adapter, vi.fn());
    stop();
    await expect(reconcile()).rejects.toThrow();
    expect(fetchPages).not.toHaveBeenCalled();
  });

  it('shares one pass between concurrent calls', async () => {
    const { adapter, fetchPages } = fakeAdapter([{ p1: '10' }]);
    const { reconcile, stop } = start(adapter, vi.fn());

    const [a, b] = await Promise.all([reconcile(), reconcile()]);
    expect(b).toBe(a);
    expect(fetchPages).toHaveBeenCalledTimes(1);
    stop();
  });

  it('runs no start pass by default, one at intervalMs, and none after stop()', async () => {
    vi.useFakeTimers();
    const { adapter, fetchPages } = fakeAdapter([{ p1: '10' }]);
    const { stop } = startFingerprintReconcile({ collection: db.products, adapter, context, reSync: vi.fn(), intervalMs: 5000 });

    await vi.advanceTimersByTimeAsync(4999);
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

  it('an explicit startDelayMs runs the first pass at that delay, the next at delay + intervalMs', async () => {
    vi.useFakeTimers();
    const { adapter, fetchPages } = fakeAdapter([{ p1: '10' }]);
    const { stop } = startFingerprintReconcile({
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
  });

  it('reports each pass on state$: running to lastResult, or to lastError on a failure', async () => {
    const pages = [{ p1: '10', p2: '20' }];
    let fail: Error | undefined;
    const adapter: FingerprintReconcileAdapter<Doc> = {
      async *fetchPages() {
        for (const page of pages) yield new Map(Object.entries(page));
        if (fail) throw fail;
      },
      fingerprint: (doc) => doc.price,
      enqueue: vi.fn(),
    };
    const { reconcile, stop, state$ } = start(adapter, vi.fn());
    const seen: FingerprintReconcileState[] = [];
    state$.subscribe((s) => seen.push(s));

    const ok = await reconcile();
    expect(seen).toEqual([
      { running: false },
      { running: true },
      { running: false, lastResult: ok },
    ]);

    fail = new Error('boom');
    await expect(reconcile()).rejects.toThrow('boom');
    expect(seen.at(-1)).toEqual({ running: false, lastResult: ok, lastError: fail });
    stop();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRxDatabase, addRxPlugin, type RxCollection } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';

import { startFingerprintReconcile, isFingerprintResultCurrent, type FingerprintReconcileState } from './fingerprint-reconcile';
import { BACKGROUND_CHUNK_SIZE as C } from './chunks';
import type { FingerprintReconcileAdapter, SyncContext } from '@tallyui/core';

addRxPlugin(RxDBDevModePlugin);
addRxPlugin(RxDBLocalDocumentsPlugin);

const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
const context: SyncContext = { connectorId: 'test', baseUrl: 'https://example.com', headers: {} };
const N = 2 * C + 7;
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

/**
 * Runs `write` once, when `collection`'s next storage query has been answered but before the
 * reader's continuation runs: the window of RxDB 16.21.1 bug 4 (`readFresh`'s doc comment), where a
 * cached `find()` counts the write's change event as seen without having its document.
 */
function writeDuringNextRead(collection: RxCollection, write: () => Promise<unknown>) {
  const instance = collection.storageInstance;
  const query = instance.query.bind(instance);
  vi.spyOn(instance, 'query').mockImplementationOnce(async (prepared) => {
    const answered = await query(prepared);
    await write();
    return answered;
  });
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
  const start = (adapter: FingerprintReconcileAdapter<Doc>, reSync: () => void, options: { startDelayMs?: number | null; intervalMs?: number; maxPages?: number; now?: () => number } = {}) =>
    startFingerprintReconcile({ collection: db.products, adapter, context, reSync, ...options });

  it('compares every product of a catalogue larger than one chunk exactly once', async () => {
    const extra = Array.from({ length: N }, (_, i) => ({ id: `k${String(i).padStart(4, '0')}`, price: '1' }));
    await db.products.bulkInsert(extra);
    const { adapter, enqueue } = fakeAdapter([{
      p1: '10', p2: '20', ...Object.fromEntries(extra.map((doc) => [doc.id, doc.id === 'k0300' ? '2' : '1'])),
    }]);
    const instance = db.products.storageInstance;
    const query = instance.query.bind(instance);
    const sizes: number[] = [];
    vi.spyOn(instance, 'query').mockImplementation(async (prepared) => {
      const result = await query(prepared);
      sizes.push(result.documents.length);
      return result;
    });
    const { reconcile, stop } = start(adapter, vi.fn());
    expect(await reconcile()).toEqual({ pages: 1, compared: N + 2, queued: 1, truncated: false, unreported: 1, complete: true });
    expect(enqueue).toHaveBeenCalledExactlyOnceWith([{ id: 'k0300', local: extra[300], refreshOnly: true }]);
    // The page's keys are read first (#248: compared page by page), then every local product for `unreported`.
    expect(sizes).toEqual([C, C, 9, C, C, 10]);
    expect(sizes.every((size) => size <= C)).toBe(true);
    stop();
  });

  it('queues exactly the mismatched products, skips ones the remote side does not report, and calls reSync once', async () => {
    const before = await revisions();
    const { adapter, enqueue } = fakeAdapter([{ p1: '10', p2: '99' }]);
    const reSync = vi.fn();
    const { reconcile, stop } = start(adapter, reSync);

    const result = await reconcile();
    expect(result).toEqual({ pages: 1, compared: 2, queued: 1, truncated: false, unreported: 1, complete: true });
    expect(enqueue).toHaveBeenCalledTimes(1);
    const [entries] = enqueue.mock.calls[0];
    expect(entries).toEqual([{ id: 'p2', local: { id: 'p2', price: '20' }, refreshOnly: true }]);
    expect(reSync).toHaveBeenCalledTimes(1);
    expect(await revisions()).toEqual(before); // never writes the collection
    stop();
  });

  it('skips reSync, and enqueue, when nothing is mismatched', async () => {
    const { adapter, enqueue } = fakeAdapter([{ p1: '10', p2: '20' }]);
    const reSync = vi.fn();
    const { reconcile, stop } = start(adapter, reSync);

    expect(await reconcile()).toEqual({ pages: 1, compared: 2, queued: 0, truncated: false, unreported: 1, complete: true });
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

  it('compares a product the pull inserted during a pass\'s local read on the next pass, and queues it if it differs', async () => {
    let remote: Record<string, string> = { p1: '10', p2: '20', p4: '40' };
    const enqueue = vi.fn();
    const adapter: FingerprintReconcileAdapter<Doc> = {
      async *fetchPages() { yield new Map(Object.entries(remote)); },
      fingerprint: (doc) => doc.price,
      enqueue,
    };
    const { reconcile, stop } = start(adapter, vi.fn());

    // The pull inserts p4 while the first pass reads the local products, so that read misses it.
    writeDuringNextRead(db.products, () => db.products.insert({ id: 'p4', price: '40' }));
    expect(await reconcile()).toEqual({ pages: 1, compared: 2, queued: 0, truncated: false, unreported: 1, complete: true });

    remote = { ...remote, p4: '45' }; // the price changed on the backend, and the pull missed it
    expect(await reconcile()).toEqual({ pages: 1, compared: 3, queued: 1, truncated: false, unreported: 1, complete: true });
    expect(enqueue).toHaveBeenCalledWith([{ id: 'p4', local: { id: 'p4', price: '40' }, refreshOnly: true }]);
    stop();
  });

  it('counts local products the remote side did not report: 3 of 10 gives unreported 3', async () => {
    await db.products.bulkInsert(Array.from({ length: 7 }, (_, i) => ({ id: `q${i}`, price: '1' })));
    // Local: p1-p3 and q0-q6. Remote reports q0-q6 only, so p1, p2 and p3 are unreported.
    const { adapter } = fakeAdapter([Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`q${i}`, '1']))]);
    const { reconcile, stop } = start(adapter, vi.fn());

    expect(await reconcile()).toEqual({ pages: 1, compared: 7, queued: 0, truncated: false, unreported: 3, complete: true });
    stop();
  });

  it('an adapter that yields no pages gives unreported: 0, not the whole catalogue', async () => {
    const { adapter } = fakeAdapter([]);
    const { reconcile, stop } = start(adapter, vi.fn());

    expect(await reconcile()).toEqual({ pages: 0, compared: 0, queued: 0, truncated: false, unreported: 0, complete: false });
    stop();
  });

  it('an adapter that yields a single empty page reports every local product as unreported', async () => {
    await db.products.bulkInsert(Array.from({ length: 7 }, (_, i) => ({ id: `q${i}`, price: '1' })));
    // Local: p1-p3 and q0-q6, 10 products. Remote reads one (empty) page, so all 10 are unreported.
    const { adapter } = fakeAdapter([{}]);
    const { reconcile, stop } = start(adapter, vi.fn());

    expect(await reconcile()).toEqual({ pages: 1, compared: 0, queued: 0, truncated: false, unreported: 10, complete: true });
    stop();
  });

  it('ignores maxPages (deprecated, #248): every page is compared and the pass never truncates', async () => {
    const before = await revisions();
    const { adapter, enqueue } = fakeAdapter([{ p1: '10' }, { p2: '99' }]);
    const reSync = vi.fn();
    const { reconcile, stop } = start(adapter, reSync, { maxPages: 1 });

    expect(await reconcile()).toEqual({ pages: 2, compared: 2, queued: 1, truncated: false, unreported: 1, complete: true });
    expect(enqueue).toHaveBeenCalledExactlyOnceWith([{ id: 'p2', local: { id: 'p2', price: '20' }, refreshOnly: true }]);
    expect(reSync).toHaveBeenCalledTimes(1);
    expect(await revisions()).toEqual(before); // never writes the collection
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

  it('a call during a pass queues one follow-up pass, not the same promise', async () => {
    const { adapter, fetchPages } = fakeAdapter([{ p1: '10' }]);
    const { reconcile, stop } = start(adapter, vi.fn());

    const first = reconcile();
    const followUp = reconcile();
    expect(followUp).not.toBe(first);
    await Promise.all([first, followUp]);
    expect(fetchPages).toHaveBeenCalledTimes(2);
    stop();
  });

  it('a price change after the first pass reads re-delivers via the follow-up, with no interval tick', async () => {
    let price = '10'; // matches local p1, so the first pass finds nothing to queue
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let firstRead!: () => void;
    const firstReadDone = new Promise<void>((resolve) => { firstRead = resolve; });
    let calls = 0;
    const enqueue = vi.fn();
    const adapter: FingerprintReconcileAdapter<Doc> = {
      async *fetchPages() {
        const call = ++calls;
        const page = new Map([['p1', price], ['p2', '20']]);
        if (call === 1) firstRead();
        yield page;
        if (call === 1) await gate;
      },
      fingerprint: (doc) => doc.price,
      enqueue,
    };
    const reSync = vi.fn();
    const { reconcile, stop } = start(adapter, reSync, { intervalMs: 86_400_000 }); // a day; proves no interval tick delivered the change

    const first = reconcile();
    const followUp = reconcile();
    expect(followUp).not.toBe(first);

    await firstReadDone; // the current pass has already read price: '10'
    price = '99'; // the price changes on the server after that read
    release();

    expect(await first).toMatchObject({ queued: 0 });
    expect(enqueue).not.toHaveBeenCalled();
    expect(await followUp).toMatchObject({ queued: 1 });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0]).toEqual([{ id: 'p1', local: { id: 'p1', price: '10' }, refreshOnly: true }]);
    stop();
  });

  it('runs no start check by default; the first check (intervalMs / 2) runs a pass, the first check past intervalMs another, none after stop()', async () => {
    vi.useFakeTimers();
    const { adapter, fetchPages } = fakeAdapter([{ p1: '10' }]);
    const { stop } = startFingerprintReconcile({ collection: db.products, adapter, context, reSync: vi.fn(), intervalMs: 300_000 });

    // #248: the persisted gate is checked every min(1 hour, intervalMs / 2); none has completed, so the first check runs a pass.
    await vi.advanceTimersByTimeAsync(149_999);
    expect(fetchPages).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchPages).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(299_999); // the check at 300 s finds it not yet due
    expect(fetchPages).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchPages).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(1_200_000);
    expect(fetchPages).toHaveBeenCalledTimes(2);
  });

  it('an explicit startDelayMs runs the first pass at that delay, the next at delay + intervalMs (checked every intervalMs / 2)', async () => {
    vi.useFakeTimers();
    const { adapter, fetchPages } = fakeAdapter([{ p1: '10' }]);
    const { stop } = startFingerprintReconcile({
      collection: db.products, adapter, context, reSync: vi.fn(), startDelayMs: 1000, intervalMs: 300_000,
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(fetchPages).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchPages).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(299_999);
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
      { running: false, lastResult: ok, lastResultAt: expect.any(Number), lastCompleteAt: expect.any(Number) },
    ]);

    fail = new Error('boom');
    await expect(reconcile()).rejects.toThrow('boom');
    expect(seen.at(-1)).toEqual({
      running: false, lastResult: ok, lastResultAt: expect.any(Number), lastCompleteAt: expect.any(Number), lastError: fail, lastErrorAt: expect.any(Number),
    });
    stop();
  });

  it('lastResultAt/lastErrorAt (from a fake now): a failed pass keeps lastResult but makes it stale; a later good pass makes it current again', async () => {
    const pages = [{ p1: '10', p2: '20' }];
    const boom = new Error('boom');
    let fail: Error | undefined;
    const adapter: FingerprintReconcileAdapter<Doc> = {
      async *fetchPages() {
        for (const page of pages) yield new Map(Object.entries(page));
        if (fail) throw fail;
      },
      fingerprint: (doc) => doc.price,
      enqueue: vi.fn(),
    };
    let clock = 1000;
    const { reconcile, stop, state$ } = start(adapter, vi.fn(), { now: () => clock });
    const seen: FingerprintReconcileState[] = [];
    state$.subscribe((s) => seen.push(s));

    const ok = await reconcile();
    expect(seen.at(-1)).toEqual({ running: false, lastResult: ok, lastResultAt: 1000, lastCompleteAt: 1000 });
    expect(isFingerprintResultCurrent(seen.at(-1)!)).toBe(true);

    clock = 2000;
    fail = boom;
    await expect(reconcile()).rejects.toThrow('boom');
    expect(seen.at(-1)).toEqual({ running: false, lastResult: ok, lastResultAt: 1000, lastCompleteAt: 1000, lastError: boom, lastErrorAt: 2000 });
    expect(isFingerprintResultCurrent(seen.at(-1)!)).toBe(false);

    clock = 3000;
    fail = undefined;
    const ok2 = await reconcile();
    // The second pass failed after reading a page, so the third resumed and is not complete.
    expect(ok2.complete).toBe(false);
    expect(seen.at(-1)).toEqual({ running: false, lastResult: ok2, lastResultAt: 3000, lastCompleteAt: 1000, lastError: boom, lastErrorAt: 2000 });
    expect(isFingerprintResultCurrent(seen.at(-1)!)).toBe(true);
    stop();
  });

  it('keeps the last complete time when a later pass reads no pages', async () => {
    const pages = [{ p1: '10', p2: '20' }];
    const { adapter } = fakeAdapter(pages);
    let clock = 1000;
    const { reconcile, stop, state$ } = start(adapter, vi.fn(), { now: () => clock });
    const seen: FingerprintReconcileState[] = [];
    state$.subscribe((state) => seen.push(state));
    try {
      expect(await reconcile()).toMatchObject({ pages: 1, complete: true });
      expect(seen.at(-1)).toMatchObject({ lastCompleteAt: 1000 });
      clock = 2000;
      pages.length = 0;
      expect(await reconcile()).toMatchObject({ pages: 0, complete: false });
      expect(seen.at(-1)).toMatchObject({ lastCompleteAt: 1000, lastResult: { complete: false } });
    } finally { stop(); }
  });

  it('a new wrapper shows the last complete time persisted by an earlier one, before any pass', async () => {
    await db.addCollections({ products_local: { schema: productSchema, localDocuments: true } });
    await db.products_local.insert({ id: 'p1', price: '10' });
    const { adapter } = fakeAdapter([{ p1: '10' }]);
    const first = startFingerprintReconcile({
      collection: db.products_local, adapter, context, reSync: vi.fn(), startDelayMs: null, now: () => 1000,
    });
    try {
      expect(await first.reconcile()).toMatchObject({ complete: true });
    } finally { first.stop(); }

    const second = startFingerprintReconcile({
      collection: db.products_local, adapter, context, reSync: vi.fn(), startDelayMs: null,
    });
    const seen: FingerprintReconcileState[] = [];
    second.state$.subscribe((state) => seen.push(state));
    try {
      await vi.waitFor(() => expect(seen.at(-1)).toMatchObject({ lastCompleteAt: 1000 }));
      expect(seen.at(-1)?.lastResult).toBeUndefined();
    } finally { second.stop(); }
  });

  it('a new wrapper keeps the last complete time after a zero-page pass', async () => {
    await db.addCollections({ products_local: { schema: productSchema, localDocuments: true } });
    await db.products_local.insert({ id: 'p1', price: '10' });
    const pages = [{ p1: '10' }];
    const { adapter } = fakeAdapter(pages);
    let clock = 1000;
    const first = startFingerprintReconcile({
      collection: db.products_local, adapter, context, reSync: vi.fn(), startDelayMs: null, now: () => clock,
    });
    try {
      expect(await first.reconcile()).toMatchObject({ pages: 1, complete: true });
      clock = 2000;
      pages.length = 0;
      expect(await first.reconcile()).toMatchObject({ pages: 0, complete: false });
    } finally { first.stop(); }

    const second = startFingerprintReconcile({
      collection: db.products_local, adapter, context, reSync: vi.fn(), startDelayMs: null,
    });
    const seen: FingerprintReconcileState[] = [];
    second.state$.subscribe((state) => seen.push(state));
    try {
      await vi.waitFor(() => expect(seen.at(-1)).toMatchObject({ lastCompleteAt: 1000 }));
      expect(seen.at(-1)?.lastResult).toBeUndefined();
    } finally { second.stop(); }
  });

  it('has no last complete time when its first pass reads no pages', async () => {
    const { adapter } = fakeAdapter([]);
    const { reconcile, stop, state$ } = start(adapter, vi.fn(), { now: () => 1000 });
    const seen: FingerprintReconcileState[] = [];
    state$.subscribe((state) => seen.push(state));
    try {
      expect(await reconcile()).toMatchObject({ pages: 0, complete: false });
      expect(seen.at(-1)).toMatchObject({ lastResult: { complete: false } });
      expect(seen.at(-1)).not.toHaveProperty('lastCompleteAt');
    } finally { stop(); }
  });

  it('a failed later pass keeps the count and marks it stale, then a good pass clears it', async () => {
    let fail = false;
    const adapter: FingerprintReconcileAdapter<Doc> = {
      async *fetchPages() {
        if (fail) { fail = false; throw new Error('network down'); }
        yield new Map([['p1', '10'], ['p2', '20']]);
      },
      fingerprint: (doc) => doc.price,
      enqueue: vi.fn(),
    };
    let clock = 1000;
    const { reconcile, stop, state$ } = start(adapter, vi.fn(), { now: () => clock });
    const seen: FingerprintReconcileState[] = [];
    state$.subscribe((state) => seen.push(state));

    expect(await reconcile()).toMatchObject({ complete: true, unreported: 1 });
    expect(seen.at(-1)).toMatchObject({ lastCompleteAt: 1000 });
    clock = 2000;
    fail = true;
    await expect(reconcile()).rejects.toThrow('network down');
    expect(seen.at(-1)).toMatchObject({ lastResult: { complete: true, unreported: 1 }, lastCompleteAt: 1000 });
    expect(isFingerprintResultCurrent(seen.at(-1)!)).toBe(false);
    clock = 3000;
    expect(await reconcile()).toMatchObject({ complete: true, unreported: 1 });
    expect(seen.at(-1)).toMatchObject({ lastCompleteAt: 3000 });
    expect(isFingerprintResultCurrent(seen.at(-1)!)).toBe(true);
    stop();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRxDatabase, addRxPlugin } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { filter, firstValueFrom, lastValueFrom, toArray } from 'rxjs';

import { startStockReconcile, type StockReconcileState } from './reconcile';
import { STOCK_LEVELS_COLLECTION, STOCK_LEVELS_LAST_PASS, stockLevelsCollection, stockLevelsSchema } from './stock-levels';
import type { StockReconcileAdapter, SyncContext } from '@tallyui/core';

addRxPlugin(RxDBDevModePlugin);
addRxPlugin(RxDBLocalDocumentsPlugin);

const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
const context: SyncContext = { connectorId: 'test', baseUrl: 'https://example.com', headers: {} };

/** Fake adapter; fetchPages yields the given pages, then throws `fail` if set. */
function fakeAdapter(pages: Array<Record<string, unknown>>, fail?: Error) {
  const fetchPages = vi.fn(async function* (_context: SyncContext) {
    for (const page of pages) yield new Map(Object.entries(page));
    if (fail) throw fail;
  });
  const adapter: StockReconcileAdapter = { fetchPages, overlay: () => undefined };
  return { adapter, fetchPages };
}

describe('startStockReconcile', () => {
  let db: any;

  beforeEach(async () => {
    db = await createRxDatabase({ name: `reconcile_${Math.random().toString(36).slice(2)}`, storage, multiInstance: false });
    await db.addCollections({ [STOCK_LEVELS_COLLECTION]: stockLevelsCollection });
    await db.stock_levels.bulkInsert([
      { id: 'v1', value: [{ onHand: 5 }], updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'v2', value: 3, updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'gone', value: 1, updatedAt: '2026-01-01T00:00:00.000Z' },
    ]);
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await db?.close();
  });

  const snapshot = async () => Object.fromEntries(
    (await db.stock_levels.find().exec()).map((d: any) => [d.id, { rev: d.revision, value: d.value, updatedAt: d.updatedAt }]),
  );
  const lastPass = async () => (await db.stock_levels.getLocal(STOCK_LEVELS_LAST_PASS))?.get('completedAt');
  const start = (adapter: StockReconcileAdapter, options: { maxPages?: number; intervalMs?: number } = {}) =>
    startStockReconcile({ collection: db.stock_levels, adapter, context, ...options });

  it('writes only changed rows and removes rows missing from a complete pass', async () => {
    const before = await snapshot();
    const { adapter } = fakeAdapter([{ v1: [{ onHand: 5 }], v2: 1 }, { v3: 7 }]);
    const { reconcileStock, stop } = start(adapter);

    const result = await reconcileStock();
    expect(result).toEqual({ pages: 2, written: 2, removed: 1, truncated: false, completedAt: expect.any(String) });
    expect(await lastPass()).toBe(result.completedAt);
    const after = await snapshot();
    expect(after.v2.updatedAt).toBe(result.completedAt);
    expect(Object.keys(after).sort()).toEqual(['v1', 'v2', 'v3']);
    expect(after.v1).toEqual(before.v1);
    expect(after.v2.value).toBe(1);
    expect(after.v2.rev).not.toBe(before.v2.rev);
    expect(after.v2.updatedAt > before.v2.updatedAt).toBe(true);
    expect(after.v3.value).toBe(7);
    stop();
  });

  it('a call during a pass queues one follow-up pass, not the same promise', async () => {
    const { adapter, fetchPages } = fakeAdapter([{ v1: 9 }]);
    const { reconcileStock, stop } = start(adapter);

    const first = reconcileStock();
    const followUp = reconcileStock();
    expect(followUp).not.toBe(first);
    await Promise.all([first, followUp]);
    expect(fetchPages).toHaveBeenCalledTimes(2);
    stop();
  });

  it('a stock flip after the first pass reads lands via the follow-up, not the current pass, with no interval tick', async () => {
    let onHand = 5; // matches the seed, so the first pass writes nothing
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let firstRead!: () => void;
    const firstReadDone = new Promise<void>((resolve) => { firstRead = resolve; });
    let calls = 0;
    const fetchPages = vi.fn(async function* () {
      const call = ++calls;
      const page = new Map(Object.entries({ v1: [{ onHand }], v2: 3, gone: 1 }));
      if (call === 1) firstRead();
      yield page;
      if (call === 1) await gate;
    });
    const adapter: StockReconcileAdapter = { fetchPages, overlay: () => undefined };
    const { reconcileStock, stop } = start(adapter, { intervalMs: 86_400_000 }); // a day; proves no interval tick delivered the flip

    const first = reconcileStock();
    const followUp = reconcileStock();
    expect(followUp).not.toBe(first);

    await firstReadDone; // the current pass has already read onHand: 5
    onHand = 0; // the stock flip happens after that read
    release();

    expect(await first).toMatchObject({ written: 0, removed: 0 });
    expect(await followUp).toMatchObject({ written: 1, removed: 0 });
    expect((await snapshot()).v1.value).toEqual([{ onHand: 0 }]);
    expect(fetchPages).toHaveBeenCalledTimes(2);
    stop();
  });

  it('stop() during a pass with a follow-up queued leaves no unhandled rejection', async () => {
    const rejections: unknown[] = [];
    const onUnhandled = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const adapter: StockReconcileAdapter = {
        async *fetchPages() {
          yield new Map([['v1', 1]]);
          await gate;
        },
        overlay: () => undefined,
      };
      const { reconcileStock, stop } = start(adapter);

      const first = reconcileStock();
      const followUp = reconcileStock();
      stop();
      release();

      await expect(first).rejects.toThrow();
      await expect(followUp).rejects.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 0)); // let any dangling microtask surface
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('writes nothing when fetchPages throws after page 1', async () => {
    const before = await snapshot();
    const { adapter } = fakeAdapter([{ v1: 0 }], new Error('network down'));
    const { reconcileStock, stop } = start(adapter);

    await expect(reconcileStock()).rejects.toThrow('network down');
    expect(await snapshot()).toEqual(before);
    expect(await lastPass()).toBeUndefined();
    stop();
  });

  it('truncates, warns and writes nothing beyond maxPages', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = await snapshot();
    const { adapter } = fakeAdapter([{ v1: 0 }, { v2: 0 }, { v3: 0 }]);
    const { reconcileStock, stop } = start(adapter, { maxPages: 2 });

    expect(await reconcileStock()).toEqual({ pages: 2, written: 0, removed: 0, truncated: true });
    expect(await snapshot()).toEqual(before);
    expect(await lastPass()).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/2-page limit.*nothing was written/));
    stop();
  });

  it('runs a pass every intervalMs, not before, and none after stop()', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { adapter, fetchPages } = fakeAdapter([{ v1: 1 }]);
    const { stop } = start(adapter, { intervalMs: 1000 });

    // A pass awaits the local-document check before fetching, so let a started pass reach fetchPages.
    const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
    vi.advanceTimersByTime(999);
    await settle();
    expect(fetchPages).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await vi.waitFor(async () => expect((await snapshot()).v1.value).toBe(1));
    expect(fetchPages).toHaveBeenCalledTimes(1);
    stop();
    vi.advanceTimersByTime(5000);
    expect(fetchPages).toHaveBeenCalledTimes(1);
  });

  it('stop() aborts a pass waiting inside fetchPages and nothing is written', async () => {
    const before = await snapshot();
    let received: AbortSignal | undefined;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const adapter: StockReconcileAdapter = {
      async *fetchPages(ctx) {
        received = ctx.signal;
        yield new Map([['v1', 0]]);
        await gate;
        yield new Map([['v2', 0]]);
      },
      overlay: () => undefined,
    };
    const { reconcileStock, stop } = start(adapter);

    const pass = reconcileStock();
    await vi.waitFor(() => expect(received).toBeDefined());
    stop();
    expect(received!.aborted).toBe(true);
    release();
    await expect(pass).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
    expect(await lastPass()).toBeUndefined();
  });

  it('an abort of context.signal stops the runner and its interval', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const outer = new AbortController();
    const { adapter, fetchPages } = fakeAdapter([{ v1: 0 }]);
    const { reconcileStock } = startStockReconcile({
      collection: db.stock_levels, adapter, context: { ...context, signal: outer.signal }, intervalMs: 1000,
    });
    outer.abort();
    expect(vi.getTimerCount()).toBe(0);
    await expect(reconcileStock()).rejects.toThrow();
    vi.advanceTimersByTime(5000);
    await new Promise((resolve) => setTimeout(resolve, 0)); // let any timed pass settle
    expect(fetchPages).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('rejects without fetching after stop()', async () => {
    const { adapter, fetchPages } = fakeAdapter([{ v1: 0 }]);
    const { reconcileStock, stop } = start(adapter);

    stop();
    await expect(reconcileStock()).rejects.toThrow();
    expect(fetchPages).not.toHaveBeenCalled();
  });

  it('records last-pass for a pass that writes nothing and reports each pass on state$', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pages = [{ v1: [{ onHand: 5 }], v2: 3, gone: 1 }];
    let fail: Error | undefined;
    const adapter: StockReconcileAdapter = {
      async *fetchPages() {
        for (const page of pages) yield new Map(Object.entries(page));
        if (fail) throw fail;
      },
      overlay: () => undefined,
    };
    const { reconcileStock, stop, state$ } = start(adapter);
    const seen: StockReconcileState[] = [];
    state$.subscribe((s) => seen.push(s));

    const ok = await reconcileStock();
    expect(ok).toMatchObject({ written: 0, removed: 0, truncated: false });
    expect(await lastPass()).toBe(ok.completedAt);
    expect(seen).toEqual([
      { running: false, truncated: false },
      { running: true, truncated: false },
      { running: false, truncated: false, lastCompletedAt: ok.completedAt },
    ]);

    fail = new Error('boom');
    await expect(reconcileStock()).rejects.toThrow('boom');
    expect(seen.at(-1)).toEqual({ running: false, truncated: false, lastCompletedAt: ok.completedAt, lastError: fail });

    fail = undefined;
    stop();
    const truncating = start(adapter, { maxPages: 0 });
    await firstValueFrom(truncating.state$.pipe(filter((s) => !!s.lastCompletedAt))); // seeded
    const last = firstValueFrom(truncating.state$.pipe(filter((s) => s.truncated)));
    expect(await truncating.reconcileStock()).toMatchObject({ truncated: true });
    expect(await last).toEqual({ running: false, truncated: true, lastCompletedAt: ok.completedAt });
    expect(await lastPass()).toBe(ok.completedAt);
    truncating.stop();
  });

  it('updates state$ from a timed pass', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { adapter } = fakeAdapter([{ v1: 1 }]);
    const { state$, stop } = start(adapter, { intervalMs: 1000 });
    const done = firstValueFrom(state$.pipe(filter((s) => !!s.lastCompletedAt)));
    vi.advanceTimersByTime(1000);
    const state = await done;
    expect(state).toEqual({ running: false, truncated: false, lastCompletedAt: expect.any(String) });
    expect(await lastPass()).toBe(state.lastCompletedAt);
    stop();
  });

  it('seeds lastCompletedAt from an existing last-pass document', async () => {
    await db.stock_levels.upsertLocal(STOCK_LEVELS_LAST_PASS, { completedAt: '2026-02-02T00:00:00.000Z' });
    const { adapter } = fakeAdapter([]);
    const { state$, stop } = start(adapter);
    expect(await firstValueFrom(state$.pipe(filter((s) => !!s.lastCompletedAt))))
      .toEqual({ running: false, truncated: false, lastCompletedAt: '2026-02-02T00:00:00.000Z' });
    stop();
  });

  it('rejects with a clear error, before fetching, when stock_levels has no local documents', async () => {
    await db.addCollections({ bare_levels: { schema: stockLevelsSchema } });
    const { adapter, fetchPages } = fakeAdapter([{ v1: 1 }]);
    const { reconcileStock, stop } = startStockReconcile({ collection: db.bare_levels, adapter, context });
    await expect(reconcileStock()).rejects.toThrow(/stockLevelsCollection \(localDocuments: true\)/);
    expect(fetchPages).not.toHaveBeenCalled();
    stop();
  });

  it('stop() completes state$', async () => {
    const { adapter } = fakeAdapter([]);
    const { state$, stop } = start(adapter);
    const all = lastValueFrom(state$.pipe(toArray()));
    stop();
    expect((await all).length).toBeGreaterThan(0);
  });
});

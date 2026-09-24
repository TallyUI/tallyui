import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRxDatabase, addRxPlugin } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';

import { startStockReconcile } from './reconcile';
import { STOCK_LEVELS_COLLECTION, stockLevelsSchema } from './stock-levels';
import type { StockReconcileAdapter, SyncContext } from '@tallyui/core';

addRxPlugin(RxDBDevModePlugin);

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
    await db.addCollections({ [STOCK_LEVELS_COLLECTION]: { schema: stockLevelsSchema } });
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
  const start = (adapter: StockReconcileAdapter, options: { maxPages?: number; intervalMs?: number } = {}) =>
    startStockReconcile({ collection: db.stock_levels, adapter, context, ...options });

  it('writes only changed rows and removes rows missing from a complete pass', async () => {
    const before = await snapshot();
    const { adapter } = fakeAdapter([{ v1: [{ onHand: 5 }], v2: 1 }, { v3: 7 }]);
    const { reconcileStock, stop } = start(adapter);

    expect(await reconcileStock()).toEqual({ pages: 2, written: 2, removed: 1, truncated: false });
    const after = await snapshot();
    expect(Object.keys(after).sort()).toEqual(['v1', 'v2', 'v3']);
    expect(after.v1).toEqual(before.v1);
    expect(after.v2.value).toBe(1);
    expect(after.v2.rev).not.toBe(before.v2.rev);
    expect(after.v2.updatedAt > before.v2.updatedAt).toBe(true);
    expect(after.v3.value).toBe(7);
    stop();
  });

  it('shares one pass between concurrent calls', async () => {
    const { adapter, fetchPages } = fakeAdapter([{ v1: 9 }]);
    const { reconcileStock, stop } = start(adapter);

    const [a, b] = await Promise.all([reconcileStock(), reconcileStock()]);
    expect(b).toBe(a);
    expect(fetchPages).toHaveBeenCalledTimes(1);
    stop();
  });

  it('writes nothing when fetchPages throws after page 1', async () => {
    const before = await snapshot();
    const { adapter } = fakeAdapter([{ v1: 0 }], new Error('network down'));
    const { reconcileStock, stop } = start(adapter);

    await expect(reconcileStock()).rejects.toThrow('network down');
    expect(await snapshot()).toEqual(before);
    stop();
  });

  it('truncates, warns and writes nothing beyond maxPages', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = await snapshot();
    const { adapter } = fakeAdapter([{ v1: 0 }, { v2: 0 }, { v3: 0 }]);
    const { reconcileStock, stop } = start(adapter, { maxPages: 2 });

    expect(await reconcileStock()).toEqual({ pages: 2, written: 0, removed: 0, truncated: true });
    expect(await snapshot()).toEqual(before);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/2-page limit.*nothing was written/));
    stop();
  });

  it('runs a pass every intervalMs, not before, and none after stop()', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { adapter, fetchPages } = fakeAdapter([{ v1: 1 }]);
    const { stop } = start(adapter, { intervalMs: 1000 });

    vi.advanceTimersByTime(999);
    expect(fetchPages).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fetchPages).toHaveBeenCalledTimes(1);
    await vi.waitFor(async () => expect((await snapshot()).v1.value).toBe(1));
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
});

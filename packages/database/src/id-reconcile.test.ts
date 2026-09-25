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
  const start = (adapter: IdReconcileAdapter<Doc>, reSync: () => void, options: { startDelayMs?: number | null; intervalMs?: number; maxPages?: number; maxDeleteShare?: number; allowMassDelete?: boolean } = {}) =>
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
    expect(result).toEqual({ pages: 1, queued: 2, truncated: false, braked: false });
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

    expect(await reconcileIds()).toEqual({ pages: 1, queued: 0, truncated: true, braked: false });
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

  it('a call during a pass queues one follow-up pass, not the same promise', async () => {
    const { adapter, fetchPages } = fakeAdapter([[{ id: 'p1', variantIds: ['v1', 'v2'] }]]);
    const { reconcileIds, stop } = start(adapter, vi.fn());

    const first = reconcileIds();
    const followUp = reconcileIds();
    expect(followUp).not.toBe(first);
    await Promise.all([first, followUp]);
    expect(fetchPages).toHaveBeenCalledTimes(2);
    stop();
  });

  it('a server deletion after the first pass reads is tombstoned by the follow-up, with no interval tick', async () => {
    // Remote agrees with every local product at first, so the first pass finds nothing to queue.
    let remote = [
      { id: 'p1', variantIds: ['v1', 'v2'] },
      { id: 'p2', variantIds: ['v3'] },
      { id: 'p3', variantIds: ['v4', 'v5'] },
    ];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let firstRead!: () => void;
    const firstReadDone = new Promise<void>((resolve) => { firstRead = resolve; });
    let calls = 0;
    const enqueue = vi.fn();
    const adapter: IdReconcileAdapter<Doc> = {
      async *fetchPages() {
        const call = ++calls;
        const page = remote;
        if (call === 1) firstRead();
        yield page;
        if (call === 1) await gate;
      },
      variantIds: (doc) => (doc.variants ?? []).map((v) => v.id),
      enqueue,
    };
    const reSync = vi.fn();
    const { reconcileIds, stop } = start(adapter, reSync, { intervalMs: 86_400_000 }); // a day; proves no interval tick delivered the tombstone

    const first = reconcileIds();
    const followUp = reconcileIds();
    expect(followUp).not.toBe(first);

    await firstReadDone; // the current pass has already read the old, complete remote list
    remote = remote.filter((p) => p.id !== 'p2'); // p2 is deleted on the server after that read
    release();

    expect(await first).toMatchObject({ queued: 0, braked: false });
    expect(enqueue).not.toHaveBeenCalled();
    expect(await followUp).toMatchObject({ queued: 1, braked: false });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0].map((e: any) => e.id)).toEqual(['p2']);
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

  describe('the mass-delete brake', () => {
    // p1, p2, p3 are already inserted by the outer beforeEach; fill up to `total`.
    async function seed(total: number) {
      const extra = Array.from({ length: total - 3 }, (_, i) => ({ id: `p${4 + i}`, variants: [{ id: `v${4 + i}` }] }));
      if (extra.length) await db.products.bulkInsert(extra);
    }

    // Remote agrees on p1..p(total-missing); the rest never appear, so they're tombstones.
    const localVariants: Record<string, string[]> = { p1: ['v1', 'v2'], p2: ['v3'], p3: ['v4', 'v5'] };
    function missingAdapter(total: number, missing: number) {
      const present = total - missing;
      const page = Array.from({ length: present }, (_, i) => {
        const id = `p${i + 1}`;
        return { id, variantIds: localVariants[id] ?? [`v${i + 1}`] };
      });
      return fakeAdapter([page]);
    }

    it('brakes at 25 of 100 missing: nothing queued, reSync skipped, a warning', async () => {
      await seed(100);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { adapter, enqueue } = missingAdapter(100, 25);
      const reSync = vi.fn();
      const { reconcileIds, stop } = start(adapter, reSync);

      expect(await reconcileIds()).toEqual({ pages: 1, queued: 0, truncated: false, braked: true });
      expect(enqueue).not.toHaveBeenCalled();
      expect(reSync).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/25 of 100.*allowMassDelete/));
      stop();
    });

    it('allowMassDelete: true queues the same 25', async () => {
      await seed(100);
      const { adapter, enqueue } = missingAdapter(100, 25);
      const reSync = vi.fn();
      const { reconcileIds, stop } = start(adapter, reSync, { allowMassDelete: true });

      expect(await reconcileIds()).toEqual({ pages: 1, queued: 25, truncated: false, braked: false });
      expect(enqueue).toHaveBeenCalledTimes(1);
      expect(reSync).toHaveBeenCalledTimes(1);
      stop();
    });

    it('15 of 100 missing (under the 20% default share) queues all 15', async () => {
      await seed(100);
      const { adapter } = missingAdapter(100, 15);
      const reSync = vi.fn();
      const { reconcileIds, stop } = start(adapter, reSync);

      expect(await reconcileIds()).toEqual({ pages: 1, queued: 15, truncated: false, braked: false });
      expect(reSync).toHaveBeenCalledTimes(1);
      stop();
    });

    it('3 of 5 missing (at or under the 10-product minimum) queues all 3', async () => {
      await seed(5);
      const { adapter } = missingAdapter(5, 3);
      const reSync = vi.fn();
      const { reconcileIds, stop } = start(adapter, reSync);

      expect(await reconcileIds()).toEqual({ pages: 1, queued: 3, truncated: false, braked: false });
      expect(reSync).toHaveBeenCalledTimes(1);
      stop();
    });

    it('maxDeleteShare: 0.5 with 25 of 100 missing queues all 25', async () => {
      await seed(100);
      const { adapter } = missingAdapter(100, 25);
      const reSync = vi.fn();
      const { reconcileIds, stop } = start(adapter, reSync, { maxDeleteShare: 0.5 });

      expect(await reconcileIds()).toEqual({ pages: 1, queued: 25, truncated: false, braked: false });
      expect(reSync).toHaveBeenCalledTimes(1);
      stop();
    });

    it('brakes when all 5 of a 5-product shop are missing, even under the minimum: nothing queued, reSync skipped', async () => {
      await seed(5);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { adapter, enqueue } = missingAdapter(5, 5);
      const reSync = vi.fn();
      const { reconcileIds, stop } = start(adapter, reSync);

      expect(await reconcileIds()).toEqual({ pages: 1, queued: 0, truncated: false, braked: true });
      expect(enqueue).not.toHaveBeenCalled();
      expect(reSync).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/5 of 5.*allowMassDelete/));
      stop();
    });

    it('brakes when all 8 of an 8-product shop are missing', async () => {
      await seed(8);
      const { adapter, enqueue } = missingAdapter(8, 8);
      const reSync = vi.fn();
      const { reconcileIds, stop } = start(adapter, reSync);

      expect(await reconcileIds()).toEqual({ pages: 1, queued: 0, truncated: false, braked: true });
      expect(enqueue).not.toHaveBeenCalled();
      expect(reSync).not.toHaveBeenCalled();
      stop();
    });

    it('allowMassDelete: true queues all 5 when every product is missing', async () => {
      await seed(5);
      const { adapter, enqueue } = missingAdapter(5, 5);
      const reSync = vi.fn();
      const { reconcileIds, stop } = start(adapter, reSync, { allowMassDelete: true });

      expect(await reconcileIds()).toEqual({ pages: 1, queued: 5, truncated: false, braked: false });
      expect(enqueue).toHaveBeenCalledTimes(1);
      expect(reSync).toHaveBeenCalledTimes(1);
      stop();
    });
  });
});

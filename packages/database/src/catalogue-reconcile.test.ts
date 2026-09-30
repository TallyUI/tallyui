// @vitest-environment node
// The catalogue reconcile (#248) runs beside a real RxDB replication: every correction reaches the
// collection through the reconcile feed and the pull, never through a local write.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { replicateRxCollection, type RxReplicationState } from 'rxdb/plugins/replication';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import {
  combinePullAdapters, createReconcileFeed,
  type CatalogueReconcileAdapter, type FingerprintReconcileAdapter, type IdReconcileAdapter, type ReplicationAdapter, type SyncContext,
} from '@tallyui/core';

import { startCatalogueReconcile, startCatalogueRunner, shouldReconcileAfterGap, type CatalogueReconcileEvent } from './catalogue-reconcile';
import { connectorCollection } from './connector-collection';
import { skipPages, startFingerprintReconcile } from './fingerprint-reconcile';
import { startIdReconcile } from './id-reconcile';

addRxPlugin(RxDBDevModePlugin);

const context: SyncContext = { connectorId: 'test', baseUrl: 'https://example.com', headers: {} };
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// The primary key is a uuid and the backend id is numeric, as on WooCommerce.
const schema = {
  version: 0,
  primaryKey: 'uuid',
  type: 'object' as const,
  properties: {
    uuid: { type: 'string', maxLength: 100 },
    id: { type: 'number' },
    name: { type: 'string' },
    stamp: { type: 'string' },
  },
  required: ['uuid', 'id'],
};
type Product = { uuid: string; id: number; name: string; stamp: string };
const uuid = (n: number) => `u-${String(n).padStart(4, '0')}`;
const product = (n: number): Product => ({ uuid: uuid(n), id: n, name: `Product ${n}`, stamp: 's1' });

/** A store whose incremental pull sees only `put`; `edit` and `remove` are the changes that pull misses. */
function makeServer(count: number) {
  const products = new Map<string, Product>();
  const seqs = new Map<string, number>();
  let seq = 0;
  const put = (p: Product) => { products.set(p.uuid, p); seqs.set(p.uuid, ++seq); };
  for (let n = 1; n <= count; n++) put(product(n));
  const pull: ReplicationAdapter<Product, { seq: number }> = {
    pull: {
      async handler(checkpoint, batchSize) {
        const from = checkpoint?.seq ?? 0;
        const rows = [...products.values()].map((p) => ({ p, s: seqs.get(p.uuid)! }))
          .filter((r) => r.s > from).sort((a, b) => a.s - b.s).slice(0, batchSize);
        return { documents: rows.map((r) => ({ ...r.p, _deleted: false })), checkpoint: { seq: rows.length ? rows[rows.length - 1].s : from } };
      },
    },
  };
  const edit = (n: number, changes: Partial<Product>) => products.set(uuid(n), { ...products.get(uuid(n))!, ...changes });
  const remove = (...ns: number[]) => { for (const n of ns) products.delete(uuid(n)); };
  return { products, pull, edit, remove };
}
type Server = ReturnType<typeof makeServer>;

/** Virtual time for the runner's clock and timers; RxDB keeps its real timers. */
function fakeTime(start = Date.UTC(2026, 8, 30)) {
  let t = start;
  let tasks: Array<{ at: number; fn: () => void }> = [];
  const setTimer = (fn: () => void, ms: number) => {
    const task = { at: t + ms, fn };
    tasks.push(task);
    return () => { tasks = tasks.filter((x) => x !== task); };
  };
  const ticks = async () => { for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 2)); };
  const fireNext = (limit = Infinity) => {
    const next = tasks.filter((x) => x.at <= limit).sort((a, b) => a.at - b.at)[0];
    if (!next) return false;
    tasks = tasks.filter((x) => x !== next);
    t = Math.max(t, next.at);
    next.fn();
    return true;
  };
  /** Fires the timers due within `ms`, in time order, letting real async work run between them. */
  const advance = async (ms: number) => {
    const target = t + ms;
    for (let i = 0; i < 10_000; i++) {
      await ticks();
      if (!fireNext(target)) break;
    }
    t = target;
    await ticks();
  };
  /**
   * Waits for `done()`, firing only timers due within a minute (the budget's waits), so a slow
   * pass never jumps the clock to an hourly check or a retry; bounded.
   */
  const runUntil = async (done: () => boolean) => {
    for (let i = 0; i < 5_000; i++) {
      await ticks();
      if (done()) return;
      fireNext(t + 60_000);
    }
    throw new Error('runUntil: gave up after 5,000 steps');
  };
  /** Delays of the pending timers shorter than a day (the far start check is left out). */
  const pendingDelays = () => tasks.map((x) => x.at - t).filter((delay) => delay < DAY);
  return { now: () => t, setTimer, advance, runUntil, pendingDelays };
}

let db: RxDatabase | undefined;
let replication: RxReplicationState<any, any> | undefined;
const stops: Array<() => void> = [];
afterEach(async () => {
  for (const stop of stops.splice(0)) stop();
  await replication?.cancel();
  await db?.close();
  db = undefined;
  replication = undefined;
  vi.restoreAllMocks();
});

async function setup(count: number) {
  const server = makeServer(count);
  db = await createRxDatabase({
    name: `catalogue_${Math.random().toString(36).slice(2)}`, multiInstance: false,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
  });
  await db.addCollections({ products: connectorCollection(schema) });
  const feed = createReconcileFeed<Product>({
    key: (doc) => doc.uuid,
    fetchByIds: async (entries) => entries.map((e) => server.products.get(e.key)).filter((p): p is Product => Boolean(p)),
  });
  const combined = combinePullAdapters<Product>({ products: server.pull, reconcile: feed.adapter });
  replication = replicateRxCollection<any, any>({
    collection: db.products, replicationIdentifier: 'catalogue-reconcile-proof',
    live: true, waitForLeadership: false, retryTime: 10,
    pull: { batchSize: 100, handler: (checkpoint, batchSize) => combined.pull.handler(checkpoint, batchSize, context) },
  });
  await replication.awaitInSync();
  expect(await db.products.count().exec()).toBe(count);
  return { server, feed, collection: db.products };
}

interface FakeOptions {
  pageSize?: number;
  now?: () => number;
  /** Throws `error` once, instead of this page. */
  fail?: { page: number; error: unknown };
  /** Which keys absent from the store `confirmGone` confirms (default: all of them). */
  confirm?: (key: string) => boolean;
}

/** A listing adapter over the store: pages of `pageSize` by uuid; the cursor is the next page number. */
function fakeAdapter(server: Server, feed: { enqueue(entries: any[]): void }, options: FakeOptions = {}) {
  const { pageSize = 2, now = Date.now, confirm = () => true } = options;
  let { fail } = options;
  const requests: number[] = [];
  const froms: Array<number | undefined> = [];
  const confirmed: string[][] = [];
  const confirmCalls: Array<{ at: number; size: number }> = [];
  const adapter: CatalogueReconcileAdapter<Product, number> = {
    async *fetchPages(_ctx, from) {
      froms.push(from);
      const all = [...server.products.values()].sort((a, b) => a.uuid.localeCompare(b.uuid));
      for (let page = from ?? 0; page * pageSize < all.length; page++) {
        requests.push(now());
        if (fail?.page === page) { const { error } = fail; fail = undefined; throw error; }
        const entries = all.slice(page * pageSize, (page + 1) * pageSize)
          .map((p) => ({ key: p.uuid, fingerprint: p.stamp, remote: p.id }));
        yield { entries, cursor: page + 1 };
      }
    },
    fingerprint: (doc) => doc.stamp,
    async confirmGone(locals) {
      confirmCalls.push({ at: now(), size: locals.length });
      const keys = locals.filter((d) => !server.products.has(d.uuid) && confirm(d.uuid)).map((d) => d.uuid);
      confirmed.push(keys);
      return keys;
    },
    enqueue: (entries) => feed.enqueue(entries),
  };
  return { adapter, requests, froms, confirmed, confirmCalls };
}

function start(
  collection: any, adapter: CatalogueReconcileAdapter<Product, number>, time: ReturnType<typeof fakeTime>,
  options: Partial<Parameters<typeof startCatalogueReconcile>[0]> = {},
) {
  const events: CatalogueReconcileEvent[] = [];
  const runner = startCatalogueReconcile({
    collection, adapter, context, reSync: () => replication!.reSync(),
    now: time.now, setTimer: time.setTimer, startDelayMs: 1e12, log: (event) => events.push(event), ...options,
  });
  stops.push(runner.stop);
  const count = (type: CatalogueReconcileEvent['type']) => events.filter((e) => e.type === type).length;
  return { runner, events, count };
}

const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 30));
  await replication!.awaitInSync();
};
const present = async (n: number) => Boolean(await db!.products.findOne(uuid(n)).exec());
const stampOf = async (n: number) => (await db!.products.findOne(uuid(n)).exec())?.stamp;
const transient = () => new Error('network down');
/** No 60 s window starting at a request holds more than `limit` requests. */
const expectWithinBudget = (times: number[], limit: number) => {
  for (const at of times) expect(times.filter((t) => t >= at && t < at + 60_000).length).toBeLessThanOrEqual(limit);
};
const tillError = () => Object.assign(new Error('signed out'), { fixedBy: 'till', code: 'unauthorized' });
const storeError = () => Object.assign(new Error('plugin missing'), { fixedBy: 'store', code: 'plugin-missing' });

describe('startCatalogueReconcile', () => {
  it('budget: page requests never exceed requestsPerMinute in any 60 s window', async () => {
    const { server, feed, collection } = await setup(70);
    const time = fakeTime();
    const { adapter, requests } = fakeAdapter(server, feed, { pageSize: 1, now: time.now });
    const { runner, count } = start(collection, adapter, time, { requestsPerMinute: 30 });

    runner.reconcile();
    await time.runUntil(() => count('pass-completed') === 1);
    expect(requests).toHaveLength(70);
    for (const at of requests) expect(requests.filter((r) => r >= at && r < at + 60_000).length).toBeLessThanOrEqual(30);
    expect(requests[69] - requests[0]).toBeGreaterThanOrEqual(120_000);
  }, 30_000);

  it('persisted gate: after a completed pass, a new runner on the same database waits intervalMs, then runs', async () => {
    const { server, feed, collection } = await setup(4);
    const time = fakeTime();
    const { adapter, froms } = fakeAdapter(server, feed, { now: time.now });
    const first = start(collection, adapter, time, { startDelayMs: 1000, intervalMs: DAY });
    await time.advance(1000);
    await time.runUntil(() => first.count('pass-completed') === 1);
    first.runner.stop();

    // A restart: a new runner, same collection.
    const second = start(collection, adapter, time, { startDelayMs: 1000, intervalMs: DAY });
    await time.advance(1000);
    expect(second.events).toContainEqual({ type: 'skipped', reason: 'gate' });
    await time.advance(22 * HOUR);
    expect(froms).toHaveLength(1);
    await time.advance(2 * HOUR);
    await time.runUntil(() => second.count('pass-completed') === 1);
    expect(froms).toHaveLength(2);
  }, 30_000);

  it('resume: a pass stopped after page 2 of 5 resumes at page 3, refetches, deletes nothing; the next full pass deletes', async () => {
    const { server, feed, collection } = await setup(12);
    const time = fakeTime();
    server.remove(11, 12); // the incremental pull misses both deletions
    server.edit(1, { stamp: 's2', name: 'edited 1' }); // page 1
    server.edit(6, { stamp: 's2', name: 'edited 6' }); // page 3
    server.edit(9, { stamp: 's2', name: 'edited 9' }); // page 5
    const { adapter, froms } = fakeAdapter(server, feed, { now: time.now, fail: { page: 2, error: transient() } });
    const { runner, events, count } = start(collection, adapter, time);

    runner.reconcile();
    await time.runUntil(() => count('stopped') === 1);
    expect(events).toContainEqual({ type: 'stopped', reason: 'transient' });
    await settle();
    expect(await stampOf(1)).toBe('s2');
    expect(await stampOf(6)).toBe('s1');

    await time.advance(5 * 60_000); // the transient retry
    await time.runUntil(() => count('pass-completed') === 1);
    expect(froms).toEqual([undefined, 2]);
    expect(events).toContainEqual({ type: 'pass-started', resumed: true });
    expect(events).toContainEqual({ type: 'kept', count: 0, keys: [], reason: 'resumed-pass' });
    expect(count('tombstoned')).toBe(0);
    await settle();
    expect([await stampOf(6), await stampOf(9)]).toEqual(['s2', 's2']);
    expect([await present(11), await present(12)]).toEqual([true, true]);

    runner.reconcile();
    await time.runUntil(() => count('pass-completed') === 2);
    expect(froms).toEqual([undefined, 2, undefined]);
    expect(events).toContainEqual({ type: 'tombstoned', count: 2, keys: [uuid(11), uuid(12)] });
    await settle();
    expect([await present(11), await present(12)]).toEqual([false, false]);
  }, 30_000);

  describe('deletion proof', () => {
    it('tombstones only the keys confirmGone confirms; the rest are kept and logged', async () => {
      const { server, feed, collection } = await setup(12);
      const time = fakeTime();
      server.remove(10, 11, 12);
      server.edit(3, { stamp: 's2' });
      const { adapter, confirmed } = fakeAdapter(server, feed, { now: time.now, confirm: (key) => key !== uuid(12) });
      const { runner, events, count } = start(collection, adapter, time);

      runner.reconcile();
      await time.runUntil(() => count('pass-completed') === 1);
      expect(confirmed).toEqual([[uuid(10), uuid(11)]]);
      expect(events.map(({ type }) => type)).toEqual(['pass-started', 'refetched', 'kept', 'tombstoned', 'pass-completed']);
      expect(events[1]).toEqual({ type: 'refetched', count: 1, keys: [uuid(3)] });
      expect(events[2]).toEqual({ type: 'kept', count: 1, keys: [uuid(12)], reason: 'unconfirmed' });
      expect(events[3]).toEqual({ type: 'tombstoned', count: 2, keys: [uuid(10), uuid(11)] });
      expect(events[4]).toEqual({
        type: 'pass-completed', pages: 5, compared: 9, refetched: 1, tombstoned: 2, kept: 1, unlisted: 3, durationMs: expect.any(Number),
      });
      await settle();
      expect([await present(10), await present(11), await present(12)]).toEqual([false, false, true]);
      expect(await stampOf(3)).toBe('s2');
    }, 30_000);

    it('a confirmGone that confirms nothing tombstones nothing: every candidate is kept as unconfirmed', async () => {
      const { server, feed, collection } = await setup(12);
      const time = fakeTime();
      server.remove(10, 11, 12);
      const { adapter, confirmed } = fakeAdapter(server, feed, { now: time.now, confirm: () => false });
      const { runner, events, count } = start(collection, adapter, time);

      runner.reconcile();
      await time.runUntil(() => count('pass-completed') === 1);
      expect(confirmed).toEqual([[]]);
      expect(count('tombstoned')).toBe(0);
      expect(events).toContainEqual({ type: 'kept', count: 3, keys: [uuid(10), uuid(11), uuid(12)], reason: 'unconfirmed' });
      await settle();
      expect([await present(10), await present(11), await present(12)]).toEqual([true, true, true]);
    }, 30_000);
  });

  describe('the mass-delete brake', () => {
    // For the store owner: plain words, no backend named, the pass's own count.
    const BRAKE_13 = '13 products the online store no longer lists were kept on this till: removing that many at once needs a '
      + 'check. If they were hidden or removed on purpose, the person who manages this till can allow the removal.';

    it('keeps 13 of 60 confirmed-gone keys (over 20% and over 10) and logs kept: brake', async () => {
      const { server, feed, collection } = await setup(60);
      const time = fakeTime();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const gone = Array.from({ length: 13 }, (_, i) => 48 + i);
      server.remove(...gone);
      const { adapter, confirmed } = fakeAdapter(server, feed, { pageSize: 20, now: time.now });
      const { runner, events, count } = start(collection, adapter, time);

      runner.reconcile();
      await time.runUntil(() => count('pass-completed') === 1);
      expect(events).toContainEqual({ type: 'kept', count: 13, keys: gone.map(uuid), reason: 'brake', message: BRAKE_13 });
      expect(count('tombstoned')).toBe(0);
      expect(confirmed).toEqual([]); // braked on the candidates, before confirmGone
      expect(warn).toHaveBeenCalledWith(`Catalogue reconcile: ${BRAKE_13} (pass allowMassDelete: true to the reconcile runner to apply it)`);
      await settle();
      expect(await db!.products.count().exec()).toBe(60);
    }, 30_000);

    it('brakes on the candidates before confirmGone: all 13 kept, confirmGone never called, though it would confirm only 2', async () => {
      const { server, feed, collection } = await setup(60);
      const time = fakeTime();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const gone = Array.from({ length: 13 }, (_, i) => 48 + i);
      server.remove(...gone);
      const { adapter, confirmCalls } = fakeAdapter(server, feed, {
        pageSize: 20, now: time.now, confirm: (key) => key === uuid(48) || key === uuid(49),
      });
      const { runner, events, count } = start(collection, adapter, time);

      runner.reconcile();
      await time.runUntil(() => count('pass-completed') === 1);
      expect(confirmCalls).toEqual([]);
      expect(events).toContainEqual({ type: 'kept', count: 13, keys: gone.map(uuid), reason: 'brake', message: BRAKE_13 });
      expect(count('tombstoned')).toBe(0);
      await settle();
      expect(await db!.products.count().exec()).toBe(60);
    }, 30_000);

    it('allowMassDelete: true tombstones the same 13', async () => {
      const { server, feed, collection } = await setup(60);
      const time = fakeTime();
      const gone = Array.from({ length: 13 }, (_, i) => 48 + i);
      server.remove(...gone);
      const { adapter } = fakeAdapter(server, feed, { pageSize: 20, now: time.now });
      const { runner, events, count } = start(collection, adapter, time, { allowMassDelete: true });

      runner.reconcile();
      await time.runUntil(() => count('pass-completed') === 1);
      expect(events).toContainEqual({ type: 'tombstoned', count: 13, keys: gone.map(uuid) });
      await settle();
      expect(await db!.products.count().exec()).toBe(47);
    }, 30_000);

    it('a 1-product till whose only product is unlisted brakes, and the message is singular', async () => {
      const { server, feed, collection } = await setup(1);
      const time = fakeTime();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      server.remove(1);
      const { adapter } = fakeAdapter(server, feed, { pageSize: 20, now: time.now });
      const { runner, events, count } = start(collection, adapter, time);

      runner.reconcile();
      await time.runUntil(() => count('pass-completed') === 1);
      const message = 'The only product on this till is no longer listed by the online store, so it was kept: removing everything '
        + 'at once needs a check. If it was hidden or removed on purpose, the person who manages this till can allow the removal.';
      expect(events).toContainEqual({ type: 'kept', count: 1, keys: [uuid(1)], reason: 'brake', message });
      expect(warn).toHaveBeenCalledWith(`Catalogue reconcile: ${message} (pass allowMassDelete: true to the reconcile runner to apply it)`);
      await settle();
      expect(await db!.products.count().exec()).toBe(1);
    }, 30_000);
  });

  describe('errors', () => {
    it('till: the pass stops and no timer retries it; reconcile() runs it again', async () => {
      const { server, feed, collection } = await setup(4);
      const time = fakeTime();
      const { adapter, froms } = fakeAdapter(server, feed, { now: time.now, fail: { page: 0, error: tillError() } });
      const { runner, events, count } = start(collection, adapter, time, { startDelayMs: 1000 });

      await time.advance(1000);
      await time.runUntil(() => count('stopped') === 1);
      expect(events).toContainEqual({ type: 'stopped', reason: 'till', code: 'unauthorized' });
      await time.advance(3 * HOUR);
      expect(froms).toHaveLength(1);

      runner.reconcile(); // after sign-in
      await time.runUntil(() => count('pass-completed') === 1);
      expect(froms).toHaveLength(2);
    }, 30_000);

    it('store: the pass is skipped until the next hourly check', async () => {
      const { server, feed, collection } = await setup(4);
      const time = fakeTime();
      const { adapter, froms } = fakeAdapter(server, feed, { now: time.now, fail: { page: 0, error: storeError() } });
      const { events, count } = start(collection, adapter, time, { startDelayMs: 1000 });

      await time.advance(1000);
      await time.runUntil(() => count('skipped') === 1);
      expect(events).toContainEqual({ type: 'skipped', reason: 'store' });
      await time.advance(HOUR - 1);
      expect(froms).toHaveLength(1);
      await time.advance(1);
      await time.runUntil(() => count('pass-completed') === 1);
      expect(froms).toHaveLength(2);
    }, 30_000);

    it('transient: retries with backoff from 5 minutes, honouring a longer retryAfterMs', async () => {
      const { server, feed, collection } = await setup(4);
      const time = fakeTime();
      let failures = [Object.assign(transient(), { retryAfterMs: 20 * 60_000 }), transient()];
      const { adapter } = fakeAdapter(server, feed, { now: time.now });
      const listing = adapter.fetchPages.bind(adapter);
      let calls = 0;
      adapter.fetchPages = async function* (ctx, from) {
        calls++;
        const error = failures[0];
        if (error) { failures = failures.slice(1); throw error; }
        yield* listing(ctx, from);
      };
      const { runner, count } = start(collection, adapter, time);

      runner.reconcile();
      await time.runUntil(() => count('stopped') === 1);
      expect(time.pendingDelays()).toEqual([20 * 60_000]); // retryAfterMs, longer than the 5-minute backoff
      await time.advance(20 * 60_000 - 1);
      expect(calls).toBe(1);
      await time.advance(1);
      await time.runUntil(() => count('stopped') === 2);
      expect(calls).toBe(2);
      expect(time.pendingDelays()).toEqual([10 * 60_000]); // doubled
      await time.advance(10 * 60_000);
      await time.runUntil(() => count('pass-completed') === 1);
      expect(calls).toBe(3);
    }, 30_000);
  });

  it.each([[false, 0], [true, 60_000]])('a page that enqueued refetches (%s) takes a second budget slot: the next page waits %i ms', async (differs, wait) => {
    const { server, feed, collection } = await setup(4);
    if (differs) server.edit(1, { stamp: 's2' }); // page 0
    const time = fakeTime();
    const { adapter, requests } = fakeAdapter(server, feed, { pageSize: 2, now: time.now });
    // Two slots a minute: page 0 and its refetch fill the first minute, or page 0 and page 1 do.
    const { runner, count } = start(collection, adapter, time, { requestsPerMinute: 2 });

    runner.reconcile();
    await time.runUntil(() => count('pass-completed') === 1);
    expect(requests[1] - requests[0]).toBe(wait);
  }, 30_000);

  it('250 candidates: confirmGone is called in chunks of 100, each after its own budget slot', async () => {
    const { server, feed, collection } = await setup(260);
    const time = fakeTime();
    const gone = Array.from({ length: 250 }, (_, i) => 11 + i);
    server.remove(...gone);
    const { adapter, requests, confirmCalls } = fakeAdapter(server, feed, { pageSize: 10, now: time.now });
    const { runner, events, count } = start(collection, adapter, time, { requestsPerMinute: 2, allowMassDelete: true });

    runner.reconcile();
    await time.runUntil(() => count('pass-completed') === 1);
    expect(confirmCalls.map((c) => c.size)).toEqual([100, 100, 50]);
    expectWithinBudget([...requests, ...confirmCalls.map((c) => c.at)], 2);
    expect(confirmCalls[2].at - requests[0]).toBeGreaterThanOrEqual(120_000);
    expect(events).toContainEqual(expect.objectContaining({ type: 'tombstoned', count: 250 }));
    await settle();
    expect(await db!.products.count().exec()).toBe(10);
  }, 30_000);

  it('a wrapper resume (skipPages) takes a budget slot for each page it re-reads', async () => {
    const { server, feed, collection } = await setup(8);
    const time = fakeTime();
    const requests: number[] = [];
    let failOnce = true;
    // An old-style listing, which always starts from the first page.
    async function* listing() {
      const all = [...server.products.values()].sort((a, b) => a.uuid.localeCompare(b.uuid));
      for (let page = 0; page * 2 < all.length; page++) {
        requests.push(time.now());
        if (page === 2 && failOnce) { failOnce = false; throw transient(); }
        yield all.slice(page * 2, page * 2 + 2);
      }
    }
    const adapter: CatalogueReconcileAdapter<Product, number> = {
      fetchPages: (_ctx, from) => skipPages(listing(), (page: Product[]) => page.map((p) => ({ key: p.uuid, fingerprint: p.stamp })), from),
      fingerprint: (doc) => doc.stamp,
      confirmGone: async () => [], // nothing is absent here
      enqueue: (entries) => feed.enqueue(entries),
    };
    const { runner, events, count } = start(collection, adapter, time, { requestsPerMinute: 2 });

    runner.reconcile();
    await time.runUntil(() => count('stopped') === 1);
    await time.advance(5 * 60_000); // the transient retry resumes at page 3
    await time.runUntil(() => count('pass-completed') === 1);
    expect(events).toContainEqual({ type: 'pass-started', resumed: true });
    expect(requests).toHaveLength(3 + 4); // pages 1-3, then 1-2 re-read and 3-4
    expectWithinBudget(requests, 2);
  }, 30_000);

  it('no page cap: 600 pages complete, and a difference on the last page is refetched', async () => {
    const { server, feed, collection } = await setup(600);
    server.edit(600, { stamp: 's2' });
    const { adapter, requests } = fakeAdapter(server, feed, { pageSize: 1 });
    const events: CatalogueReconcileEvent[] = [];
    // Real timers here: a day's start delay stays within setTimeout's range.
    const runner = startCatalogueReconcile({
      collection, adapter, context, reSync: () => replication!.reSync(), startDelayMs: DAY,
      requestsPerMinute: 10_000, log: (event) => events.push(event),
    });
    stops.push(runner.stop);

    runner.reconcile();
    await vi.waitFor(() => expect(events.some((e) => e.type === 'pass-completed')).toBe(true), { timeout: 40_000, interval: 20 });
    expect(requests).toHaveLength(600);
    expect(events.find((e) => e.type === 'pass-completed')).toMatchObject({ pages: 600, compared: 600, refetched: 1 });
    await settle();
    expect(await stampOf(600)).toBe('s2');
  }, 60_000);

  it('checks the gate every min(1 hour, intervalMs / 2): a 30-minute runner runs every 30 minutes, not hourly', async () => {
    const { server, feed, collection } = await setup(2);
    const time = fakeTime();
    const { adapter, froms } = fakeAdapter(server, feed, { now: time.now });
    const { count } = start(collection, adapter, time, { startDelayMs: 1000, intervalMs: 30 * 60_000 });

    await time.advance(1000);
    await time.runUntil(() => count('pass-completed') === 1);
    await time.advance(30 * 60_000 - 1);
    expect(froms).toHaveLength(1); // the 15-minute check found it not yet due
    await time.advance(1); // 30 minutes after the first pass
    await vi.waitFor(() => expect(froms).toHaveLength(2), { timeout: 5_000, interval: 10 });
    await time.runUntil(() => count('pass-completed') === 2);
    await time.advance(30 * 60_000);
    await time.runUntil(() => count('pass-completed') === 3);
    expect(froms).toHaveLength(3);
  }, 30_000);

  it.each([0, Number.NaN])('an intervalMs of %s still checks the gate at most once a minute', async (intervalMs) => {
    const { server, feed, collection } = await setup(2);
    const time = fakeTime();
    const delays: number[] = [];
    const setTimer = (fn: () => void, ms: number) => { delays.push(ms); return time.setTimer(fn, ms); };
    const { adapter } = fakeAdapter(server, feed, { now: time.now });
    const { count } = start(collection, adapter, time, { startDelayMs: 1000, intervalMs, setTimer });

    await time.advance(1000);
    await time.runUntil(() => count('pass-completed') >= 1);
    // After the start delay, every re-arm of the gate check is at least a minute away.
    expect(delays.slice(1).length).toBeGreaterThan(0);
    expect(Math.min(...delays.slice(1))).toBeGreaterThanOrEqual(60_000);
  }, 30_000);

  it('the keep-all path (the fingerprint wrapper) never calls confirmGone and takes no budget slot, even under the brake threshold', async () => {
    const { server, feed, collection } = await setup(12);
    const time = fakeTime();
    server.remove(10, 11, 12); // 3 of 12, under the brake: a deleting runner would ask confirmGone
    const { adapter, confirmCalls } = fakeAdapter(server, feed, { pageSize: 9, now: time.now });
    const events: CatalogueReconcileEvent[] = [];
    // Two slots: the page and the end of the listing. A confirmGone chunk would need a third, a minute later.
    const runner = startCatalogueRunner({
      collection, adapter, context, reSync: () => replication!.reSync(), now: time.now, setTimer: time.setTimer,
      startDelayMs: 1e12, requestsPerMinute: 2, keepCandidates: true, log: (event) => events.push(event),
    });
    stops.push(runner.stop);
    const started = time.now();

    let summary: Awaited<ReturnType<typeof runner.request>> | undefined;
    runner.request().then((result) => { summary = result; });
    await time.runUntil(() => summary !== undefined);
    expect(confirmCalls).toEqual([]);
    expect(time.now()).toBe(started);
    expect(events.map(({ type }) => type)).toEqual(['pass-started', 'pass-completed']);
    expect(summary).toMatchObject({ pages: 1, tombstoned: 0, kept: 0, unlisted: 3 });
    await settle();
    expect([await present(10), await present(11), await present(12)]).toEqual([true, true, true]);
  }, 30_000);

  it('state$ reports running, the last result and the last error', async () => {
    const { server, feed, collection } = await setup(2);
    const time = fakeTime();
    const { adapter } = fakeAdapter(server, feed, { now: time.now, fail: { page: 0, error: transient() } });
    const { runner, count } = start(collection, adapter, time);
    const seen: any[] = [];
    runner.state$.subscribe((state) => seen.push(state));

    runner.reconcile();
    await time.runUntil(() => count('stopped') === 1);
    expect(seen.at(-1)).toMatchObject({ running: false, lastErrorAt: time.now() });
    runner.reconcile();
    await time.runUntil(() => count('pass-completed') === 1);
    expect(seen.at(-1)).toMatchObject({ running: false, lastResult: { pages: 1 }, lastResultAt: time.now() });
  }, 30_000);
});

describe('shouldReconcileAfterGap', () => {
  it('is true once the last successful pull is more than 6 hours old', () => {
    const now = Date.UTC(2026, 8, 30, 12);
    expect(shouldReconcileAfterGap(now - 6 * HOUR - 1, now)).toBe(true);
    expect(shouldReconcileAfterGap(now - 6 * HOUR, now)).toBe(false);
    expect(shouldReconcileAfterGap(undefined, now)).toBe(false);
  });
});

describe('the old runners are wrappers over the catalogue runner', () => {
  const stateOf = async (id: string) => (await db!.products.getLocal(id))?.get('lastCompletedAt');

  it('startIdReconcile drives a pass through it: the gate is persisted, and deletions still go through the feed', async () => {
    const { server, collection } = await setup(4);
    server.remove(4);
    const enqueue = vi.fn();
    const adapter: IdReconcileAdapter<Product> = {
      async *fetchPages() { yield [...server.products.values()].map((p) => ({ id: p.uuid, variantIds: [] })); },
      variantIds: () => [],
      enqueue,
    };
    const runner = startIdReconcile({ collection, adapter, context, reSync: vi.fn(), startDelayMs: null });
    stops.push(runner.stop);

    expect(await runner.reconcileIds()).toEqual({ pages: 1, queued: 1, truncated: false, braked: false });
    expect(enqueue).toHaveBeenCalledExactlyOnceWith([{ id: uuid(4), local: product(4) }]);
    expect(await stateOf('id-reconcile')).toEqual(expect.any(Number));
  });

  it('startIdReconcile hands candidates to the feed as plain entries: the feed\'s by-id re-read tombstones only what does not come back', async () => {
    const { server, collection } = await setup(4);
    // Products 3 and 4 are missing from the id listing; the by-id read still returns 3 (a listing glitch) but not 4.
    server.remove(4);
    const feed = createReconcileFeed<Product>({
      key: (doc) => doc.uuid,
      fetchByIds: async (entries) => entries.map((e) => server.products.get(e.key)).filter((p): p is Product => Boolean(p)),
    });
    const enqueue = vi.fn((entries: Array<{ id: string; local: Product }>) => feed.enqueue(entries));
    const adapter: IdReconcileAdapter<Product> = {
      async *fetchPages() { yield [...server.products.values()].filter((p) => p.uuid !== uuid(3)).map((p) => ({ id: p.uuid, variantIds: [] })); },
      variantIds: () => [],
      enqueue,
    };
    const runner = startIdReconcile({ collection, adapter, context, reSync: vi.fn(), startDelayMs: null });
    stops.push(runner.stop);

    expect(await runner.reconcileIds()).toEqual({ pages: 1, queued: 2, truncated: false, braked: false });
    expect(enqueue).toHaveBeenCalledExactlyOnceWith([{ id: uuid(3), local: product(3) }, { id: uuid(4), local: product(4) }]);
    const { documents } = await feed.adapter.pull.handler(undefined, 100, context);
    expect(documents).toEqual([{ ...product(3), _deleted: false }, { ...product(4), _deleted: true }]);
  });

  it('startFingerprintReconcile with 60% unreported: no brake warning, confirmGone never called, unreported counted', async () => {
    const { server, collection } = await setup(20);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const enqueue = vi.fn();
    // The listing reports 8 of the 20 local products: 12 unreported, over 20% and over 10.
    const adapter: FingerprintReconcileAdapter<Product> = {
      async *fetchPages() { yield new Map([...server.products.values()].slice(0, 8).map((p) => [p.uuid, p.stamp])); },
      fingerprint: (doc) => doc.stamp,
      enqueue,
    };
    const runner = startFingerprintReconcile({ collection, adapter, context, reSync: vi.fn() });
    stops.push(runner.stop);

    // The wrapper's internal confirmGone throws if called, which would reject this pass.
    expect(await runner.reconcile()).toEqual({ pages: 1, compared: 8, queued: 0, truncated: false, unreported: 12 });
    expect(warn).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('startFingerprintReconcile drives a pass through it: refreshOnly entries, nothing deleted, the gate persisted', async () => {
    const { server, collection } = await setup(4);
    server.edit(2, { stamp: 's2' });
    const enqueue = vi.fn();
    const adapter: FingerprintReconcileAdapter<Product> = {
      async *fetchPages() { yield new Map([...server.products.values()].slice(0, 3).map((p) => [p.uuid, p.stamp])); },
      fingerprint: (doc) => doc.stamp,
      enqueue,
    };
    const runner = startFingerprintReconcile({ collection, adapter, context, reSync: vi.fn() });
    stops.push(runner.stop);

    expect(await runner.reconcile()).toEqual({ pages: 1, compared: 3, queued: 1, truncated: false, unreported: 1 });
    expect(enqueue).toHaveBeenCalledExactlyOnceWith([{ id: uuid(2), local: product(2), refreshOnly: true }]);
    expect(await stateOf('fingerprint-reconcile')).toEqual(expect.any(Number));
  });
});

describe('the refetch budget counts the pull\'s requests: refetchBatchSize (#307)', () => {
  // One slot a minute, so each slot a page's refetch takes delays the next page by a minute.
  it.each([
    [1000, 100, 10], // Medusa: 1,000 changed ids are 10 fetchByIds requests of 100
    [100, 100, 1], // a WooCommerce page of 100
    [1000, undefined, 1], // unset: one slot per page, as before
  ])('a page that enqueued %i refetches with refetchBatchSize %s takes %i slots', async (n, refetchBatchSize, slots) => {
    const { server, feed, collection } = await setup(n + 1);
    for (let i = 1; i <= n; i++) server.edit(i, { stamp: 's2' });
    const time = fakeTime();
    const { adapter, requests } = fakeAdapter(server, feed, { pageSize: n, now: time.now });
    const { runner, count } = start(collection, { ...adapter, refetchBatchSize }, time, { requestsPerMinute: 1 });

    runner.reconcile();
    await time.runUntil(() => count('pass-completed') === 1);
    expect(requests[1] - requests[0]).toBe((1 + slots) * 60_000);
    await settle();
    expect(await stampOf(n)).toBe('s2');
  }, 60_000);

  it.each([['id', 5, 2], ['fingerprint', 5, 2], ['id', undefined, 1]] as const)(
    'the %s wrapper passes refetchBatchSize %s through: a page of 10 differing products takes %i slots',
    async (kind, refetchBatchSize, slots) => {
      const { server, collection } = await setup(11);
      const time = fakeTime();
      const requests: number[] = [];
      async function* pages<T>(page: (p: Product) => T) {
        const all = [...server.products.values()].sort((a, b) => a.uuid.localeCompare(b.uuid));
        for (const slice of [all.slice(0, 10), all.slice(10)]) { requests.push(time.now()); yield slice.map(page); }
      }
      // The wrappers take no budget options of their own; these reach the runner through the options they pass on.
      const budget = { requestsPerMinute: 1, now: time.now, setTimer: time.setTimer } as object;
      const common = { collection, context, reSync: vi.fn(), startDelayMs: null, ...budget };
      let done = false;
      if (kind === 'id') {
        const adapter: IdReconcileAdapter<Product> = {
          fetchPages: () => pages((p) => ({ id: p.uuid, variantIds: ['v'] })), variantIds: () => [], enqueue: vi.fn(), refetchBatchSize,
        };
        const runner = startIdReconcile({ ...common, adapter });
        stops.push(runner.stop);
        void runner.reconcileIds().then(() => { done = true; });
      } else {
        const adapter: FingerprintReconcileAdapter<Product> = {
          fetchPages: () => (async function* () { for await (const page of pages((p) => [p.uuid, 's2'] as const)) yield new Map(page); })(),
          fingerprint: (doc) => doc.stamp, enqueue: vi.fn(), refetchBatchSize,
        };
        const runner = startFingerprintReconcile({ ...common, adapter });
        stops.push(runner.stop);
        void runner.reconcile().then(() => { done = true; });
      }
      await time.runUntil(() => done);
      expect(requests[1] - requests[0]).toBe((1 + slots) * 60_000);
    }, 30_000,
  );
});

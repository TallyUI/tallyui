// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { ConnectorUnauthorizedError, neutralFailureClass, type SyncContext, type TallyConnector } from '@tallyui/core';

import { createConnectivityTracker, type ConnectivityTracker } from './connectivity';
import { startReplication } from './replication';

addRxPlugin(RxDBDevModePlugin);

const context: SyncContext = { connectorId: 'test', baseUrl: 'https://example.com', headers: {} };
const schema = {
  version: 0, primaryKey: 'id', type: 'object' as const,
  properties: { id: { type: 'string', maxLength: 100 }, name: { type: 'string' } },
  required: ['id', 'name'],
};
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean, ms = 2000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out waiting');
    await sleep(5);
  }
}
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

const gate = { classifyFailure: (error: unknown) => ((error as { code?: string }).code === 'gate'
  ? { updateRequired: { reason: 'till_update_required', fixedBy: 'till' as const, status: 426 } } : neutralFailureClass(error)) };
const refusal = () => Object.assign(new Error('426'), { code: 'gate', status: 426 });
// Node's fetch rejection for a refused connection (no response): the socket's code is on `cause`.
const unreachable = () => Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });

async function products() {
  const db = await createRxDatabase({
    name: `conn${Date.now()}${Math.random().toString(36).slice(2)}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    multiInstance: false,
  });
  cleanup.push(() => db.close());
  return (await db.addCollections({ products: { schema } })).products;
}

/** A pull that runs `answer` per call; the tracker's clock moves 30 s per call. */
async function setup(answer: (call: number) => unknown, connector?: Pick<TallyConnector, 'classifyFailure'>) {
  const collection = await products();
  let calls = 0;
  const tracker = createConnectivityTracker({ connector, now: () => calls * 30_000 });
  const states: string[] = [];
  tracker.snapshot$.subscribe(snapshot => states.push(snapshot.updateRequired ? 'update-required' : snapshot.state));
  const adapter = {
    pull: {
      handler: async (checkpoint: unknown) => {
        const result = answer(++calls);
        if (result instanceof Error) throw result;
        return { documents: [], checkpoint };
      },
    },
  };
  const state = startReplication({ collection, adapter, context, retryTime: 10, connectivity: tracker });
  cleanup.push(() => state.cancel());
  return { state, tracker, states, calls: () => calls };
}

/** Waits for `check` like `until`, then lets the test's own assertions report what is missing. */
const settle = (check: () => boolean, ms?: number) => until(check, ms).catch(() => undefined);

/**
 * A push-only store: `answer` runs per push call (an Error rejects it, a promise holds it); `accepted` lists each row
 * id the store took, in order. The tracker's clock moves 30 s per push call. `rows` are in the collection before the
 * replication starts, so RxDB's initial upstream sync sends them in `batchSize` pages. `pull` runs per pull call the
 * same way (an Error rejects it).
 */
async function pushSetup(answer: (call: number) => unknown, tracker?: ConnectivityTracker,
  { batchSize, rows = [], retryTime = 10, pull }:
  { batchSize?: number; rows?: string[]; retryTime?: number; pull?: (call: number) => unknown } = {}) {
  const collection = await products();
  await insert(collection, ...rows);
  let calls = 0;
  const connectivity = tracker ?? createConnectivityTracker({ connector: gate, now: () => calls * 30_000 });
  const accepted: string[] = [];
  let pulls = 0;
  const adapter = {
    pull: {
      handler: async (checkpoint: unknown) => {
        const result = await pull?.(++pulls);
        if (result instanceof Error) throw result;
        return { documents: [], checkpoint };
      },
    },
    push: {
      handler: async (rows: { newDocumentState: { id: string } }[]) => {
        const result = await answer(++calls);
        if (result instanceof Error) throw result;
        accepted.push(...rows.map(row => row.newDocumentState.id));
        return [];
      },
      batchSize,
    },
  };
  const state = startReplication({ collection, adapter: adapter as never, context, retryTime, connectivity });
  cleanup.push(() => state.cancel());
  const errors: unknown[] = [];
  state.error$.subscribe(error => errors.push(error));
  const states: string[] = [];
  connectivity.snapshot$.subscribe(snapshot => states.push(snapshot.updateRequired ? 'update-required' : snapshot.state));
  return { state, collection, adapter, tracker: connectivity, accepted, errors, states, calls: () => calls };
}

function insert(collection: Awaited<ReturnType<typeof products>>, ...ids: string[]) {
  return Promise.all(ids.map(id => collection.insert({ id, name: id })));
}
// Seven rows in push pages of two: four pages, so RxDB queues pages behind the first (upstream.js 90-100).
const seven = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
const pages = { batchSize: 2 };

describe('startReplication with a connectivity tracker', () => {
  it('a failing pull drives the tracker offline, and a success brings it back online', async () => {
    const { tracker, states } = await setup(call => (call <= 2 ? unreachable() : undefined));
    await until(() => states.includes('offline') && tracker.current().state === 'online');
    expect(states).toEqual(['online', 'online', 'offline', 'online']);
  });

  it("latches the connector's update-required refusal, stops calling the adapter, and re-probes on reset", async () => {
    const { state, tracker, calls } = await setup(call => (call === 1 ? refusal() : undefined), gate);
    await until(() => tracker.current().updateRequired !== null);
    await sleep(100);
    expect(calls()).toBe(1);
    await state.resume();
    await sleep(50);
    expect(calls()).toBe(1);
    expect(tracker.current().updateRequired).toMatchObject({ reason: 'till_update_required', fixedBy: 'till' });
    tracker.resetUpdateRequired();
    await until(() => calls() === 2);
    expect(tracker.current().updateRequired).toBeNull();
  });

  it('records push success and push failure', async () => {
    const tracker = createConnectivityTracker();
    const seen: string[] = [];
    const spy: ConnectivityTracker = {
      ...tracker,
      recordSuccess: () => { seen.push('success'); tracker.recordSuccess(); },
      recordFailure: (error) => { seen.push('failure'); return tracker.recordFailure(error); },
    };
    const { collection, accepted } = await pushSetup(call => (call === 1 ? unreachable() : undefined), spy);
    await sleep(50);
    seen.length = 0;
    await insert(collection, 'a');
    await until(() => accepted.length === 1);
    expect(seen).toEqual(['failure', 'success']);
  });

  it('a push refusal latches with one error, not one per retry, and the reset sends the held push once', async () => {
    const { collection, tracker, accepted, errors, calls } = await pushSetup(call => (call === 1 ? refusal() : undefined));
    await insert(collection, 'a');
    await until(() => tracker.current().updateRequired !== null);
    await sleep(100);
    expect(errors).toHaveLength(1);
    expect(calls()).toBe(1);
    tracker.resetUpdateRequired();
    await until(() => accepted.length === 1);
    await sleep(50);
    expect(accepted).toEqual(['a']);
  });

  it('reset-then-resume drains the held queue in insert order, each row once', async () => {
    const tracker = createConnectivityTracker({ connector: gate });
    tracker.recordFailure(refusal());
    const { state, collection, accepted, errors, calls } = await pushSetup(() => undefined, tracker);
    for (const id of ['a', 'b', 'c']) await insert(collection, id);
    await sleep(100);
    expect(calls()).toBe(0);
    expect(errors).toHaveLength(0);
    tracker.resetUpdateRequired();
    await state.resume();
    await until(() => accepted.length >= 3);
    await sleep(50);
    expect(accepted).toEqual(['a', 'b', 'c']);
  });

  it('a push in flight when the latch sets is marked pushed and not sent again after the reset', async () => {
    let finish!: () => void;
    const held = new Promise<void>((resolve) => { finish = resolve; });
    const { collection, tracker, accepted, calls } = await pushSetup(call => (call === 1 ? held : undefined));
    await insert(collection, 'a');
    await until(() => calls() === 1);
    tracker.recordFailure(refusal());
    finish();
    await until(() => accepted.length === 1);
    await insert(collection, 'b');
    await sleep(100);
    expect(calls()).toBe(1);
    tracker.resetUpdateRequired();
    await until(() => accepted.length >= 2);
    await sleep(50);
    expect(accepted).toEqual(['a', 'b']);
  });

  it('a held push released while paused sends nothing until resume, then sends once', async () => {
    const tracker = createConnectivityTracker({ connector: gate });
    tracker.recordFailure(refusal());
    const { state, collection, accepted, calls } = await pushSetup(() => undefined, tracker);
    await insert(collection, 'a');
    await sleep(100);
    expect(calls()).toBe(0);
    await state.pause();
    tracker.resetUpdateRequired();
    await sleep(100);
    expect(calls()).toBe(0);
    await state.start();
    await until(() => accepted.length >= 1);
    await sleep(100);
    expect(accepted).toEqual(['a']);
  });

  it('a held push released while paused loses no row across push pages, and sends each once after start', async () => {
    const tracker = createConnectivityTracker({ connector: gate });
    tracker.recordFailure(refusal());
    const { state, accepted, calls } = await pushSetup(() => undefined, tracker, { ...pages, rows: seven });
    await sleep(100);
    expect(calls()).toBe(0);
    await state.pause();
    tracker.resetUpdateRequired();
    await sleep(100);
    expect(calls()).toBe(0);
    await state.start();
    await settle(() => accepted.length >= seven.length);
    await sleep(100);
    expect([...accepted].sort()).toEqual(seven);
  });

  it('a reset while paused, with rows written during the pause, sends each row once after start', async () => {
    const tracker = createConnectivityTracker({ connector: gate });
    tracker.recordFailure(refusal());
    const { state, collection, accepted, calls } = await pushSetup(() => undefined, tracker, pages);
    await sleep(50);
    await state.pause();
    await insert(collection, ...seven);
    tracker.resetUpdateRequired();
    await sleep(100);
    expect(calls()).toBe(0);
    await state.start();
    await settle(() => accepted.length >= seven.length);
    await sleep(100);
    expect([...accepted].sort()).toEqual(seven);
  });

  it('a cancel releases a held push without sending it', async () => {
    const tracker = createConnectivityTracker({ connector: gate });
    tracker.recordFailure(refusal());
    const { state, calls } = await pushSetup(() => undefined, tracker, { ...pages, rows: seven });
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', onRejection);
    try {
      await sleep(100);
      await state.cancel();
      // RxDB's upstream queue settles only once every held push has returned.
      const queue = state.internalReplicationState!.streamQueue.up.then(() => 'settled');
      expect(await Promise.race([queue, sleep(1000).then(() => 'still held')])).toBe('settled');
      await sleep(50);
    } finally {
      process.off('unhandledRejection', onRejection);
    }
    expect(calls()).toBe(0);
    expect(rejections).toEqual([]);
  });

  it('a cancel cuts short the retry wait after a thrown push: the handler returns at once and sends nothing more', async () => {
    const { state, calls } = await pushSetup(() => unreachable(), undefined, { rows: ['a'], retryTime: 60_000 });
    await until(() => calls() === 1);
    await sleep(50);
    await state.cancel();
    // RxDB's cancel() does not wait for the push (it awaits the checkpoint queue), so watch the upstream queue settle.
    const queue = state.internalReplicationState!.streamQueue.up.then(() => 'settled');
    expect(await Promise.race([queue, sleep(1000).then(() => 'still waiting')])).toBe('settled');
    expect(calls()).toBe(1);
  });

  it('a pause during a push in flight keeps its answer: the row is marked pushed and not sent again after start', async () => {
    let finish!: () => void;
    const held = new Promise<void>((resolve) => { finish = resolve; });
    const { state, collection, accepted, calls } = await pushSetup(call => (call === 1 ? held : undefined));
    await insert(collection, 'a');
    await until(() => calls() === 1);
    await state.pause();
    finish();
    await sleep(50);
    await state.start();
    await insert(collection, 'b');
    await settle(() => accepted.length >= 3, 300);
    expect(accepted).toEqual(['a', 'b']);
  });

  it('start() inside the retry wait after a thrown push sends each row once', async () => {
    const { state, accepted, calls } = await pushSetup(call => (call === 1 ? unreachable() : undefined), undefined,
      { ...pages, rows: seven, retryTime: 300 });
    await until(() => calls() === 1);
    await state.pause();
    await state.start();
    await settle(() => accepted.length >= seven.length);
    await sleep(100);
    expect([...accepted].sort()).toEqual(seven);
  });

  // RxDB 17.5's own push retry wait, ending while paused, returns [] unsent (plugins/replication/index.js 266, 269), and
  // the queued pages then store the up checkpoint (upstream.js 211): every row lost. The handler retries itself instead.
  it('a retry wait after a thrown push that ends while paused loses no row, and sends each once after start', async () => {
    const { state, accepted, calls } = await pushSetup(call => (call === 1 ? unreachable() : undefined), undefined,
      { ...pages, rows: seven, retryTime: 100 });
    await until(() => calls() === 1);
    await state.pause();
    await sleep(300);
    await state.start();
    await settle(() => accepted.length >= seven.length);
    await sleep(100);
    expect([...accepted].sort()).toEqual(seven);
  });

  it('a sign-in error on the pull while a thrown push waits to retry loses no row: each goes once after resume', async () => {
    let pushed = false;
    const { state, accepted, errors } = await pushSetup((call) => {
      pushed = true;
      return call === 1 ? unreachable() : undefined;
    }, undefined, {
      ...pages, rows: seven, retryTime: 100,
      pull: async call => (call === 1 ? until(() => pushed).then(() => new ConnectorUnauthorizedError('x', 401)) : undefined),
    });
    await until(() => state.isPaused());
    await sleep(300);
    expect(accepted).toEqual([]);
    expect(errors).toHaveLength(1);
    await state.resume();
    await settle(() => accepted.length >= seven.length);
    await sleep(100);
    expect([...accepted].sort()).toEqual(seven);
  });

  // Known limit (RxDB 17.5): a push sent while paused and then cancelled is never recorded (upstream.js 287), and its
  // up checkpoint is not stored, so the next replication sends those rows again. No connector has a push handler today.
  it('known limit: a cancel while a sent push is held for a pause sends its rows again on the next start', async () => {
    let finish!: () => void;
    const held = new Promise<void>((resolve) => { finish = resolve; });
    const { state, collection, adapter, accepted, calls } = await pushSetup(call => (call === 1 ? held : undefined),
      undefined, { rows: ['a'] });
    await until(() => calls() === 1);
    await state.pause();
    finish();
    await until(() => accepted.length === 1);
    await state.cancel();
    const next = startReplication({ collection, adapter: adapter as never, context, retryTime: 10 });
    cleanup.push(() => next.cancel());
    await settle(() => accepted.length >= 2);
    await sleep(100);
    expect(accepted).toEqual(['a', 'a']);
  });

  it('flapping offline, online, offline, online loses and doubles no write, and ends online', async () => {
    let down = true;
    const { collection, accepted, states, tracker } = await pushSetup(() => (down ? unreachable() : undefined));
    await insert(collection, 'a');
    await until(() => tracker.current().state === 'offline');
    down = false;
    await until(() => accepted.length === 1 && tracker.current().state === 'online');
    down = true;
    await insert(collection, 'b');
    await until(() => tracker.current().state === 'offline');
    down = false;
    await until(() => accepted.length === 2 && tracker.current().state === 'online');
    await sleep(50);
    expect(accepted).toEqual(['a', 'b']);
    expect(states.filter((state, i) => state !== states[i - 1])).toEqual(['online', 'offline', 'online', 'offline', 'online']);
  });
});

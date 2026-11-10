// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { neutralFailureClass, type SyncContext, type TallyConnector } from '@tallyui/core';

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

/**
 * A push-only store: `answer` runs per push call (an Error rejects it, a promise holds it); `accepted` lists each row
 * id the store took, in order. The tracker's clock moves 30 s per push call.
 */
async function pushSetup(answer: (call: number) => unknown, tracker?: ConnectivityTracker) {
  const collection = await products();
  let calls = 0;
  const connectivity = tracker ?? createConnectivityTracker({ connector: gate, now: () => calls * 30_000 });
  const accepted: string[] = [];
  const adapter = {
    pull: { handler: async (checkpoint: unknown) => ({ documents: [], checkpoint }) },
    push: {
      handler: async (rows: { newDocumentState: { id: string } }[]) => {
        const result = await answer(++calls);
        if (result instanceof Error) throw result;
        accepted.push(...rows.map(row => row.newDocumentState.id));
        return [];
      },
    },
  };
  const state = startReplication({ collection, adapter: adapter as never, context, retryTime: 10, connectivity });
  cleanup.push(() => state.cancel());
  const errors: unknown[] = [];
  state.error$.subscribe(error => errors.push(error));
  const states: string[] = [];
  connectivity.snapshot$.subscribe(snapshot => states.push(snapshot.updateRequired ? 'update-required' : snapshot.state));
  return { state, collection, tracker: connectivity, accepted, errors, states, calls: () => calls };
}

const insert = (collection: Awaited<ReturnType<typeof products>>, ...ids: string[]) =>
  Promise.all(ids.map(id => collection.insert({ id, name: id })));

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

// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { SyncContext, TallyConnector } from '@tallyui/core';

import { createConnectivityTracker } from './connectivity';
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

/** A pull that runs `answer` per call; the tracker's clock moves 30 s per call. */
async function setup(answer: (call: number) => unknown, connector?: Pick<TallyConnector, 'classifyFailure'>) {
  const db = await createRxDatabase({
    name: `conn${Date.now()}${Math.random().toString(36).slice(2)}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    multiInstance: false,
  });
  cleanup.push(() => db.close());
  const { products } = await db.addCollections({ products: { schema } });
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
  const state = startReplication({ collection: products, adapter, context, retryTime: 10, connectivity: tracker });
  cleanup.push(() => state.cancel());
  return { state, tracker, states, calls: () => calls };
}

describe('startReplication with a connectivity tracker', () => {
  it('a failing pull drives the tracker offline, and a success brings it back online', async () => {
    const { tracker, states } = await setup(call => (call <= 2 ? new TypeError('Failed to fetch') : undefined));
    await until(() => states.includes('offline') && tracker.current().state === 'online');
    expect(states).toEqual(['online', 'online', 'offline', 'online']);
  });

  it("latches the connector's update-required refusal and stops calling the adapter", async () => {
    const refusal = Object.assign(new Error('426'), { code: 'gate' });
    const connector = {
      classifyFailure: (error: unknown) => ((error as { code?: string }).code === 'gate'
        ? { updateRequired: { reason: 'till_update_required', fixedBy: 'till' as const, status: 426 } } : null),
    };
    const { state, tracker, calls } = await setup(() => refusal, connector);
    await until(() => tracker.current().updateRequired !== null);
    await sleep(100);
    expect(calls()).toBe(1);
    await state.resume();
    await sleep(50);
    expect(calls()).toBe(1);
    expect(tracker.current().updateRequired).toMatchObject({ reason: 'till_update_required', fixedBy: 'till' });
  });

  it('holds the push while latched, without calling the adapter', async () => {
    const db = await createRxDatabase({
      name: `push${Date.now()}${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
      multiInstance: false,
    });
    cleanup.push(() => db.close());
    const { products } = await db.addCollections({ products: { schema } });
    await products.insert({ id: 'a', name: 'A' });
    const tracker = createConnectivityTracker({ connector: { classifyFailure: () => ({ updateRequired: { reason: 'gate', fixedBy: 'till' } }) } });
    tracker.recordFailure(new Error('426'));
    let pushes = 0;
    const adapter = {
      pull: { handler: async (checkpoint: unknown) => ({ documents: [], checkpoint }) },
      push: { handler: async () => { pushes++; return []; } },
    };
    const state = startReplication({ collection: products, adapter, context, retryTime: 10, connectivity: tracker });
    cleanup.push(() => state.cancel());
    const errors: unknown[] = [];
    state.error$.subscribe(error => errors.push(error));
    await until(() => errors.length > 0);
    expect(pushes).toBe(0);
  });
});

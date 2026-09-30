// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { ConnectorUnauthorizedError, type SyncContext, type SyncNotice } from '@tallyui/core';

import { MAX_RETRY_TIME_MS, startReplication } from './replication';

addRxPlugin(RxDBDevModePlugin);

const RETRY = 20;
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

type Pull = (call: number, checkpoint: unknown) => { documents: any[]; checkpoint: unknown };

async function setup(pull: { current: Pull }, autoStart = true) {
  const db = await createRxDatabase({
    name: `perm${Date.now()}${Math.random().toString(36).slice(2)}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    multiInstance: false,
  });
  cleanup.push(() => db.close());
  const { products } = await db.addCollections({ products: { schema } });
  const calls: unknown[] = [];
  const adapter = {
    pull: {
      handler: async (checkpoint: unknown) => {
        calls.push(checkpoint);
        return pull.current(calls.length, checkpoint) as any;
      },
    },
  };
  const state = startReplication({ collection: products, adapter, context, retryTime: RETRY, autoStart });
  cleanup.push(() => state.cancel());
  const notices: (SyncNotice | undefined)[] = [];
  state.notice$.subscribe(notice => notices.push(notice));
  const errors: unknown[] = [];
  const delays: (number | undefined)[] = [];
  state.error$.subscribe(error => {
    errors.push(error);
    delays.push(state.retryTime);
  });
  return { state, products, calls, notices, errors, delays };
}

const unauthorized = () => { throw new ConnectorUnauthorizedError('x', 401); };
const empty: Pull = (_call, checkpoint) => ({ documents: [], checkpoint });

describe('startReplication on pull errors, through the real RxDB loop', () => {
  it('a permanent error costs one request and one notice, then silence', async () => {
    const { state, calls, notices, errors } = await setup({ current: unauthorized });
    await until(() => state.isPaused());
    await sleep(RETRY * 5);
    state.reSync();
    await sleep(RETRY * 5);
    expect(calls).toHaveLength(1);
    expect(notices).toEqual([undefined, { code: 'unauthorized', since: expect.any(Number) }]);
    expect(errors).toEqual([]);
    expect(state.isPaused()).toBe(true);
  });

  it('a WooDateFilterError-style permanent error sets the unsupported_store notice', async () => {
    // A local stand-in, so the database package does not depend on the WooCommerce connector.
    class UnsupportedStoreError extends Error {
      readonly code = 'unsupported_store' as const;
      readonly permanent = true as const;
    }
    const { state, calls, notices, errors } = await setup({ current: () => { throw new UnsupportedStoreError('old store'); } });
    await until(() => state.isPaused());
    await sleep(RETRY * 5);
    expect(calls).toHaveLength(1);
    expect(notices).toEqual([undefined, { code: 'unsupported_store', since: expect.any(Number) }]);
    expect(errors).toEqual([]);
  });

  it('a repeated permanent error keeps the first notice and returns an empty page', async () => {
    const { state, notices } = await setup({ current: unauthorized }, false);
    await expect(state.pull!.handler({ id: 'c' }, 10)).resolves.toEqual({ documents: [], checkpoint: { id: 'c' } });
    const [, first] = notices;
    await sleep(5);
    await state.pull!.handler({ id: 'c' }, 10);
    expect(notices).toEqual([undefined, first]);
  });

  it('a transient error keeps retrying with a growing delay', async () => {
    const pull = { current: ((call, checkpoint) => {
      if (call <= 3) throw new Error('WooCommerce API error: 503');
      return call === 4 ? { documents: [{ id: '1', name: 'Widget', _deleted: false }], checkpoint: { id: '1' } }
        : { documents: [], checkpoint };
    }) as Pull };
    const { state, products, calls, notices, delays } = await setup(pull);
    await until(() => calls.length >= 4);
    await state.awaitInSync();
    expect(delays).toEqual([RETRY, RETRY * 2, RETRY * 4]);
    expect(state.retryTime).toBe(RETRY);
    expect(notices).toEqual([undefined]);
    expect(await products.find().exec()).toHaveLength(1);
  });

  it('a retryAfterMs longer than the backoff is respected', async () => {
    const pull = { current: ((call, checkpoint) => {
      if (call === 1) throw Object.assign(new Error('WooCommerce API error: 429'), { retryAfterMs: 1000 });
      return { documents: [], checkpoint };
    }) as Pull };
    const { state, delays } = await setup(pull);
    await until(() => delays.length === 1);
    expect(state.retryTime).toBeGreaterThanOrEqual(1000);
  });

  it('resume() restarts the pull after a permanent error', async () => {
    const pull = { current: unauthorized as Pull };
    const { state, products, calls, notices } = await setup(pull);
    await until(() => state.isPaused());
    pull.current = (call, checkpoint) => call === 2
      ? { documents: [{ id: '1', name: 'Widget', _deleted: false }], checkpoint: { id: '1' } }
      : empty(call, checkpoint);
    await state.resume();
    await until(() => calls.length >= 2);
    await state.awaitInSync();
    expect(notices).toEqual([undefined, { code: 'unauthorized', since: expect.any(Number) }, undefined]);
    expect(state.isPaused()).toBe(false);
    expect(await products.find().exec()).toHaveLength(1);
  });

  it('the backoff is capped', async () => {
    const { state } = await setup({ current: () => { throw new Error('offline'); } }, false);
    const seen: number[] = [];
    for (let i = 0; i < 30; i++) {
      await state.pull!.handler(undefined, 10).catch(() => {});
      seen.push(state.retryTime!);
    }
    expect(Math.max(...seen)).toBe(MAX_RETRY_TIME_MS);
    expect(seen.at(-1)).toBe(MAX_RETRY_TIME_MS);
  });
});

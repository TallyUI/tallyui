// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { ConnectorUnauthorizedError, type SyncContext, type SyncNotice } from '@tallyui/core';

import { MAX_RETRY_AFTER_MS, MAX_RETRY_TIME_MS, startReplication } from './replication';

addRxPlugin(RxDBDevModePlugin);

const RETRY = 20;
// A small ceiling stands in for MAX_RETRY_TIME_MS, so the real loop can retry a store error within the test.
const CEILING = 200;
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

async function setup(pull: { current: Pull }, { autoStart = true, ceiling }: { autoStart?: boolean; ceiling?: number } = {}) {
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
  const state = startReplication({
    collection: products, adapter, context, retryTime: RETRY, autoStart,
    ...(ceiling === undefined ? {} : { maxRetryTimeMs: ceiling }),
  });
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

// Local stand-ins, so the database package does not depend on a connector.
class UnsupportedStoreError extends Error {
  readonly code = 'unsupported_store' as const;
  readonly fixedBy = 'store' as const;
  readonly software = 'WooCommerce';
  readonly minVersion = '5.8';
}
class MisconfiguredStoreError extends Error {
  readonly code = 'store_misconfigured' as const;
  readonly fixedBy = 'store' as const;
  readonly fix = 'run the server in UTC';
}
const unauthorized = () => { throw new ConnectorUnauthorizedError('x', 401); };
const unsupported = () => { throw new UnsupportedStoreError('old store'); };
const offline = () => { throw new Error('offline'); };
const empty: Pull = (_call, checkpoint) => ({ documents: [], checkpoint });
const widget = { documents: [{ id: '1', name: 'Widget', _deleted: false }], checkpoint: { id: '1' } };
const unsupportedNotice = {
  code: 'unsupported_store', since: expect.any(Number), fixedBy: 'store', software: 'WooCommerce', minVersion: '5.8',
};

const tillNotice = { code: 'unauthorized', since: expect.any(Number), fixedBy: 'till' };

/**
 * A minimal `document`, installed before startReplication, so RxDB 17.5's
 * replicateRxCollection registers its toggleOnDocumentVisible handler on it: a
 * `visibilitychange` to 'visible' calls `start()` (which undoes `pause()` and
 * re-syncs), and one to 'hidden' pauses a tab that is not the leader.
 */
function fakeDocument() {
  const listeners = new Set<() => void>();
  const page = {
    visibilityState: 'visible' as 'visible' | 'hidden',
    addEventListener: (type: string, listener: () => void) => { if (type === 'visibilitychange') listeners.add(listener); },
    removeEventListener: (type: string, listener: () => void) => { listeners.delete(listener); },
  };
  (globalThis as { document?: unknown }).document = page;
  cleanup.push(async () => { delete (globalThis as { document?: unknown }).document; });
  return {
    listeners,
    toggle(visibility: 'visible' | 'hidden') {
      page.visibilityState = visibility;
      for (const listener of [...listeners]) listener();
    },
  };
}

describe('startReplication on pull errors, through the real RxDB loop', () => {
  it('a till-fixed error still pauses until resume(): one request, one notice, then silence', async () => {
    const { state, calls, notices, errors } = await setup({ current: unauthorized });
    await until(() => state.isPaused());
    await sleep(RETRY * 5);
    state.reSync();
    await sleep(RETRY * 5);
    expect(calls).toHaveLength(1);
    expect(notices).toEqual([undefined, tillNotice]);
    expect(errors).toEqual([]);
    expect(state.isPaused()).toBe(true);
  });

  it('a 403 emits a forbidden store notice, retries, and clears on success without resume()', async () => {
    const pull = { current: ((call, checkpoint) => {
      if (call <= 2) throw new ConnectorUnauthorizedError('x', 403);
      return call === 3 ? widget : empty(call, checkpoint);
    }) as Pull };
    const { state, products, calls, notices, errors, delays } = await setup(pull, { ceiling: CEILING });
    await until(() => notices.length > 1);
    expect(notices[1]).toEqual({ code: 'forbidden', since: expect.any(Number), fixedBy: 'store' });
    await until(() => calls.length >= 3);
    await state.awaitInSync();
    expect(errors).toHaveLength(2);
    expect(delays).toEqual([CEILING, CEILING]);
    expect(notices).toEqual([undefined, notices[1], undefined]);
    expect(state.isPaused()).toBe(false);
    expect(await products.find().exec()).toHaveLength(1);
  });

  it('a till-fixed error makes no further request when the page becomes visible again, until resume()', async () => {
    const page = fakeDocument();
    const pull = { current: unauthorized as Pull };
    const { state, products, calls, notices } = await setup(pull);
    expect(page.listeners.size).toBe(1);
    await until(() => state.isPaused());
    for (let i = 0; i < 3; i++) {
      page.toggle('hidden');
      page.toggle('visible');
      await sleep(RETRY * 3);
    }
    expect(calls).toHaveLength(1);
    expect(notices).toEqual([undefined, tillNotice]);
    await until(() => state.isPaused());
    pull.current = (call, checkpoint) => call === 2 ? widget : empty(call, checkpoint);
    await state.resume();
    await until(() => calls.length >= 2);
    await state.awaitInSync();
    expect(notices).toEqual([undefined, tillNotice, undefined]);
    expect(await products.find().exec()).toHaveLength(1);
  });

  it('a store-fixed error makes no request within its delay when the page becomes visible again', async () => {
    const page = fakeDocument();
    const pull = { current: ((call, checkpoint) => {
      if (call === 1) unsupported();
      return call === 2 ? widget : empty(call, checkpoint);
    }) as Pull };
    const { state, products, calls, notices } = await setup(pull, { ceiling: CEILING * 2 });
    expect(page.listeners.size).toBe(1);
    await until(() => calls.length === 1);
    const failedAt = Date.now();
    for (let i = 0; i < 3; i++) {
      page.toggle('hidden');
      page.toggle('visible');
      await sleep(RETRY * 2);
    }
    expect(Date.now() - failedAt).toBeLessThan(CEILING * 2);
    expect(calls).toHaveLength(1);
    await until(() => calls.length >= 2);
    expect(Date.now() - failedAt).toBeGreaterThanOrEqual(CEILING * 2 - 30);
    await state.awaitInSync();
    expect(notices).toEqual([undefined, unsupportedNotice, undefined]);
    expect(await products.find().exec()).toHaveLength(1);
  });

  it('a call within the store delay rethrows the stored error without calling the adapter, with retryTime set to the time left', async () => {
    const pull = { current: unsupported as Pull };
    const { state, calls, notices } = await setup(pull, { autoStart: false, ceiling: CEILING });
    const first = await state.pull!.handler(undefined, 10).catch((error: unknown) => error);
    expect(first).toBeInstanceOf(UnsupportedStoreError);
    await sleep(CEILING / 2);
    pull.current = empty;
    const early = await state.pull!.handler(undefined, 10).catch((error: unknown) => error);
    expect(early).toBe(first);
    expect(calls).toHaveLength(1);
    expect(state.retryTime).toBeGreaterThan(0);
    expect(state.retryTime).toBeLessThanOrEqual(CEILING / 2 + 5);
    expect(notices).toEqual([undefined, unsupportedNotice]);
    await sleep(state.retryTime! + 5);
    await expect(state.pull!.handler(undefined, 10)).resolves.toEqual({ documents: [], checkpoint: undefined });
    expect(calls).toHaveLength(2);
    expect(notices).toEqual([undefined, unsupportedNotice, undefined]);
  });

  it('a store-fixed error shows one notice, retries at the ceiling, and clears itself on the first success', async () => {
    const pull = { current: ((call, checkpoint) => {
      if (call <= 2) unsupported();
      return call === 3 ? widget : empty(call, checkpoint);
    }) as Pull };
    const { state, products, calls, notices, errors, delays } = await setup(pull, { ceiling: CEILING });
    await until(() => calls.length >= 3);
    await state.awaitInSync();
    expect(errors).toHaveLength(2);
    expect(delays).toEqual([CEILING, CEILING]);
    expect(notices).toEqual([undefined, unsupportedNotice, undefined]);
    expect(state.isPaused()).toBe(false);
    expect(state.retryTime).toBe(RETRY);
    expect(await products.find().exec()).toHaveLength(1);
  });

  it('a repeated store-fixed error waits the full ceiling each time, and keeps the first notice and its since', async () => {
    const short = 30;
    const { state, calls, notices } = await setup({ current: unsupported }, { autoStart: false, ceiling: short });
    for (let i = 0; i < 3; i++) {
      await expect(state.pull!.handler(undefined, 10)).rejects.toBeInstanceOf(UnsupportedStoreError);
      expect(state.retryTime).toBe(short);
      await sleep(short + 5);
    }
    expect(calls).toHaveLength(3);
    expect(notices).toEqual([undefined, unsupportedNotice]);
  });

  it("a store-fixed error's fix is copied onto the notice; a non-string one is not", async () => {
    const short = 30;
    const pull = { current: (() => { throw new MisconfiguredStoreError('tz'); }) as Pull };
    const { state, notices } = await setup(pull, { autoStart: false, ceiling: short });
    await state.pull!.handler(undefined, 10).catch(() => {});
    expect(notices.at(-1)).toEqual({ code: 'store_misconfigured', since: expect.any(Number), fixedBy: 'store', fix: 'run the server in UTC' });
    await sleep(short + 5);
    pull.current = empty;
    await state.pull!.handler(undefined, 10);
    expect(notices.at(-1)).toBeUndefined();
    pull.current = () => { throw Object.assign(new Error('odd'), { code: 'store_misconfigured', fixedBy: 'store', fix: 7, software: 5 }); };
    await state.pull!.handler(undefined, 10).catch(() => {});
    expect(notices.at(-1)).toEqual({ code: 'store_misconfigured', since: expect.any(Number), fixedBy: 'store' });
  });

  it('a transient error after a store error keeps the store notice until a success', async () => {
    const short = 60;
    const pull = { current: unsupported as Pull };
    const { state, notices } = await setup(pull, { autoStart: false, ceiling: short });
    await state.pull!.handler(undefined, 10).catch(() => {});
    expect(state.retryTime).toBe(short);
    await sleep(short + 5);
    pull.current = offline;
    await state.pull!.handler(undefined, 10).catch(() => {});
    expect(state.retryTime).toBe(RETRY);
    await state.pull!.handler(undefined, 10).catch(() => {});
    expect(state.retryTime).toBe(RETRY * 2);
    expect(notices).toEqual([undefined, unsupportedNotice]);
    pull.current = unsupported;
    await state.pull!.handler(undefined, 10).catch(() => {});
    expect(state.retryTime).toBe(short);
    expect(notices).toEqual([undefined, unsupportedNotice]);
    await sleep(short + 5);
    pull.current = empty;
    await state.pull!.handler(undefined, 10);
    expect(notices).toEqual([undefined, unsupportedNotice, undefined]);
    expect(state.retryTime).toBe(RETRY);
  });

  it('a till error after a store error replaces the store notice and takes the till path', async () => {
    const short = 30;
    const pull = { current: unsupported as Pull };
    const { state, notices } = await setup(pull, { autoStart: false, ceiling: short });
    await state.pull!.handler(undefined, 10).catch(() => {});
    await sleep(short + 5);
    pull.current = unauthorized;
    await expect(state.pull!.handler(undefined, 10)).resolves.toEqual({ documents: [], checkpoint: undefined });
    expect(notices).toEqual([undefined, unsupportedNotice, tillNotice]);
  });

  it('a repeated till error keeps the first notice and returns an empty page', async () => {
    const { state, notices } = await setup({ current: unauthorized }, { autoStart: false });
    await expect(state.pull!.handler({ id: 'c' }, 10)).resolves.toEqual({ documents: [], checkpoint: { id: 'c' } });
    const [, first] = notices;
    await sleep(5);
    await state.pull!.handler({ id: 'c' }, 10);
    expect(notices).toEqual([undefined, first]);
  });

  it('after a till error, calls return an empty page without calling the adapter; a success cannot clear the notice', async () => {
    const pull = { current: unauthorized as Pull };
    const { state, calls, notices } = await setup(pull, { autoStart: false });
    await state.pull!.handler(undefined, 10);
    pull.current = () => widget;
    await expect(state.pull!.handler({ id: 'c' }, 10)).resolves.toEqual({ documents: [], checkpoint: { id: 'c' } });
    expect(calls).toHaveLength(1);
    expect(notices).toEqual([undefined, tillNotice]);
  });

  it('a transient error keeps retrying with a growing delay', async () => {
    const pull = { current: ((call, checkpoint) => {
      if (call <= 3) throw new Error('WooCommerce API error: 503');
      return call === 4 ? widget : empty(call, checkpoint);
    }) as Pull };
    const { state, products, calls, notices, delays } = await setup(pull);
    await until(() => calls.length >= 4);
    await state.awaitInSync();
    expect(delays).toEqual([RETRY, RETRY * 2, RETRY * 4]);
    expect(state.retryTime).toBe(RETRY);
    expect(notices).toEqual([undefined]);
    expect(await products.find().exec()).toHaveLength(1);
  });

  it('a failure after a success starts the delay again at retryTime', async () => {
    const pull = { current: offline as Pull };
    const { state } = await setup(pull, { autoStart: false });
    await state.pull!.handler(undefined, 10).catch(() => {});
    await state.pull!.handler(undefined, 10).catch(() => {});
    expect(state.retryTime).toBe(RETRY * 2);
    pull.current = empty;
    await state.pull!.handler(undefined, 10);
    pull.current = offline;
    await state.pull!.handler(undefined, 10).catch(() => {});
    expect(state.retryTime).toBe(RETRY);
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

  it('a retryAfterMs that is NaN, negative, Infinity or not a number is ignored; a valid one is capped at MAX_RETRY_AFTER_MS', async () => {
    const pull = { current: offline as Pull };
    const { state } = await setup(pull, { autoStart: false });
    const seen: number[] = [];
    for (const retryAfterMs of [NaN, -5, Infinity, -Infinity, '5000', 2 * 60 * 60 * 1000]) {
      pull.current = () => { throw Object.assign(new Error('WooCommerce API error: 429'), { retryAfterMs }); };
      await state.pull!.handler(undefined, 10).catch(() => {});
      seen.push(state.retryTime!);
    }
    expect(seen).toEqual([RETRY, RETRY * 2, RETRY * 4, RETRY * 8, RETRY * 16, MAX_RETRY_AFTER_MS]);
    expect(MAX_RETRY_AFTER_MS).toBe(60 * 60 * 1000);
  });

  it('a store delay is the ceiling, or a valid retryAfterMs up to MAX_RETRY_AFTER_MS', async () => {
    const cases: [unknown, number][] = [
      [undefined, CEILING], [NaN, CEILING], [-5, CEILING], [Infinity, CEILING], [CEILING / 2, CEILING],
      [1000, 1000], [2 * 60 * 60 * 1000, MAX_RETRY_AFTER_MS],
    ];
    for (const [retryAfterMs, expected] of cases) {
      const error = Object.assign(new UnsupportedStoreError('old store'), { retryAfterMs });
      const { state } = await setup({ current: () => { throw error; } }, { autoStart: false, ceiling: CEILING });
      await state.pull!.handler(undefined, 10).catch(() => {});
      expect([retryAfterMs, state.retryTime]).toEqual([retryAfterMs, expected]);
    }
  });

  it('resume() restarts the pull after a till error', async () => {
    const pull = { current: unauthorized as Pull };
    const { state, products, calls, notices } = await setup(pull);
    await until(() => state.isPaused());
    pull.current = (call, checkpoint) => call === 2 ? widget : empty(call, checkpoint);
    await state.resume();
    await until(() => calls.length >= 2);
    await state.awaitInSync();
    expect(notices).toEqual([undefined, tillNotice, undefined]);
    expect(state.isPaused()).toBe(false);
    expect(await products.find().exec()).toHaveLength(1);
  });

  it('the backoff is capped at MAX_RETRY_TIME_MS by default', async () => {
    const { state } = await setup({ current: offline }, { autoStart: false });
    const seen: number[] = [];
    for (let i = 0; i < 30; i++) {
      await state.pull!.handler(undefined, 10).catch(() => {});
      seen.push(state.retryTime!);
    }
    expect(Math.max(...seen)).toBe(MAX_RETRY_TIME_MS);
    expect(seen.at(-1)).toBe(MAX_RETRY_TIME_MS);
  });

  it('a store error waits MAX_RETRY_TIME_MS by default', async () => {
    const { state } = await setup({ current: unsupported }, { autoStart: false });
    await state.pull!.handler(undefined, 10).catch(() => {});
    expect(state.retryTime).toBe(MAX_RETRY_TIME_MS);
  });
});

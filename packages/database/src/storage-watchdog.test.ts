// @vitest-environment node
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { RxStorage } from 'rxdb';

import type { TallyConnector } from '@tallyui/core';

import {
  STORAGE_WRITE_STALL_MS,
  STORAGE_READ_WATCHDOG_MS,
  isStorageWorkerFailure,
  withStorageWatchdog,
  type StorageHealth,
  type StorageWatchdogOptions,
} from './storage-watchdog';

type Methods = Record<string, (...args: any[]) => Promise<any>>;

// A fake storage whose instance methods can be slow or never settle, to
// exercise the watchdog without a real worker. `createDelayMs` delays
// createStorageInstance on the (fake) clock.
function fakeStorage(methods: Methods = {}, createDelayMs = 0): RxStorage<any, any> {
  return {
    name: 'fake',
    rxdbVersion: '0.0.0',
    tallyEngine: 'sqlite-sahpool',
    async createStorageInstance(params: any) {
      if (createDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, createDelayMs));
      return {
        databaseName: params.databaseName,
        collectionName: params.collectionName,
        schema: params.schema,
        internals: {},
        options: {},
        bulkWrite: async () => ({ success: [], error: [] }),
        query: async () => ({ documents: [] }),
        count: async () => ({ count: 0, mode: 'fast' }),
        findDocumentsById: async () => [],
        getChangedDocumentsSince: async () => ({ documents: [], checkpoint: {} }),
        getAttachmentData: vi.fn(),
        cleanup: vi.fn(async () => true),
        changeStream: () => ({ subscribe: () => ({ unsubscribe() {} }) }),
        close: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
        ...methods,
      };
    },
  } as unknown as RxStorage<any, any>;
}

const params = { databaseName: 'd', collectionName: 'c', schema: {}, options: {}, multiInstance: false, devMode: false } as any;
const never = () => new Promise<never>(() => {});
const after = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

async function setup(methods: Methods = {}, options?: StorageWatchdogOptions) {
  const storage = withStorageWatchdog(fakeStorage(methods), options);
  const instance: any = await storage.createStorageInstance(params);
  let latest!: StorageHealth;
  storage.health$.subscribe((health) => { latest = health; });
  return { instance, health: () => latest };
}

// Records whether a promise settled, without awaiting it.
function track(promise: Promise<unknown>) {
  const state = { resolved: false, rejected: false };
  promise.then(() => { state.resolved = true; }, () => { state.rejected = true; });
  return state;
}

describe('storage-watchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('writes are flagged, never rejected', () => {
    it('a write that resolves after 15s resolves with its result; stalled while pending, ok after', async () => {
      const result = { success: [{ id: 'p1' }], error: [] };
      const { instance, health } = await setup({ bulkWrite: () => after(15_000, result) });
      const start = Date.now();
      const write = instance.bulkWrite([], 'test');
      const state = track(write);

      await vi.advanceTimersByTimeAsync(STORAGE_WRITE_STALL_MS);
      expect(health()).toEqual({ status: 'stalled', stalledWrites: 1, stalledSince: start });
      expect(state).toEqual({ resolved: false, rejected: false });

      await vi.advanceTimersByTimeAsync(5_000);
      await expect(write).resolves.toBe(result);
      expect(state.rejected).toBe(false);
      expect(health()).toEqual({ status: 'ok', stalledWrites: 0 });
    });

    it('a write that never resolves stays pending after 60s, and the status stays stalled', async () => {
      const { instance, health } = await setup({ bulkWrite: never });
      const state = track(instance.bulkWrite([], 'test'));

      await vi.advanceTimersByTimeAsync(60_000);
      expect(state).toEqual({ resolved: false, rejected: false });
      expect(health()).toMatchObject({ status: 'stalled', stalledWrites: 1 });
      // No timer is left that could settle it on a clock.
      expect(vi.getTimerCount()).toBe(0);
    });

    it('returns the storage promise itself, and passes a rejection through unchanged', async () => {
      const result = Promise.resolve({ success: [], error: [] });
      const { instance } = await setup({ bulkWrite: () => result });
      expect(instance.bulkWrite([], 'test')).toBe(result);

      const failure = new Error('CONFLICT');
      const failing = await setup({ bulkWrite: () => Promise.reject(failure) });
      await expect(failing.instance.bulkWrite([], 'test')).rejects.toBe(failure);
      expect(failing.health()).toEqual({ status: 'ok', stalledWrites: 0 });
    });

    it('stalledSince is the start of the oldest stalled write, and each settle lowers the count', async () => {
      let release!: () => void;
      const first = new Promise<any>((resolve) => { release = () => resolve({ success: [], error: [] }); });
      const writes = [() => first, never];
      const { instance, health } = await setup({ bulkWrite: () => writes.shift()!() });
      const start = Date.now();
      instance.bulkWrite([], 'first');
      await vi.advanceTimersByTimeAsync(1_000);
      instance.bulkWrite([], 'second');

      await vi.advanceTimersByTimeAsync(STORAGE_WRITE_STALL_MS);
      expect(health()).toEqual({ status: 'stalled', stalledWrites: 2, stalledSince: start });

      release();
      await vi.advanceTimersByTimeAsync(0);
      expect(health()).toEqual({ status: 'stalled', stalledWrites: 1, stalledSince: start + 1_000 });
    });
  });

  it('createStorageInstance has no deadline: a 45s create resolves normally and nothing is flagged', async () => {
    const storage = withStorageWatchdog(fakeStorage({}, 45_000));
    let latest!: StorageHealth;
    storage.health$.subscribe((health) => { latest = health; });
    const created = storage.createStorageInstance(params);
    const state = track(created);

    await vi.advanceTimersByTimeAsync(45_000);
    await expect(created).resolves.toMatchObject({ collectionName: 'c' });
    expect(state.rejected).toBe(false);
    expect(latest).toEqual({ status: 'ok', stalledWrites: 0 });
  });

  describe('reads are watched: two silent windows mean dead', () => {
    it.each(['query', 'count', 'findDocumentsById', 'getChangedDocumentsSince'])(
      '%s: one silent window leaves ok, the second sets dead, and the read is never rejected',
      async (method) => {
        const { instance, health } = await setup({ [method]: never });
        const state = track(instance[method]());

        await vi.advanceTimersByTimeAsync(STORAGE_READ_WATCHDOG_MS);
        expect(health().status).toBe('ok');
        await vi.advanceTimersByTimeAsync(STORAGE_READ_WATCHDOG_MS);
        expect(health().status).toBe('dead');
        expect(state).toEqual({ resolved: false, rejected: false });
      },
    );

    it('with a stalled write, one silent read window leaves the status stalled', async () => {
      const { instance, health } = await setup({ bulkWrite: never, query: never });
      instance.bulkWrite([], 'test');
      instance.query();

      await vi.advanceTimersByTimeAsync(STORAGE_READ_WATCHDOG_MS);
      expect(health()).toMatchObject({ status: 'stalled', stalledWrites: 1 });
      await vi.advanceTimersByTimeAsync(STORAGE_READ_WATCHDOG_MS);
      expect(health()).toMatchObject({ status: 'dead', stalledWrites: 1 });
    });

    it.each(['count', 'bulkWrite'])('a %s that settles in between resets the silent count', async (method) => {
      const { instance, health } = await setup({ query: never });
      instance.query();

      await vi.advanceTimersByTimeAsync(STORAGE_READ_WATCHDOG_MS); // one silent window
      await instance[method]([], 'test'); // settles during the second window
      await vi.advanceTimersByTimeAsync(STORAGE_READ_WATCHDOG_MS * 2); // second (not silent), third (silent)
      expect(health().status).toBe('ok');
      await vi.advanceTimersByTimeAsync(STORAGE_READ_WATCHDOG_MS); // fourth: two silent in a row
      expect(health().status).toBe('dead');
    });

    it('dead is sticky: later reads and writes settling do not clear it', async () => {
      let release!: () => void;
      const stuck = new Promise<any>((resolve) => { release = () => resolve({ documents: [] }); });
      const { instance, health } = await setup({ query: () => stuck });
      instance.query();
      await vi.advanceTimersByTimeAsync(STORAGE_READ_WATCHDOG_MS * 2);
      expect(health().status).toBe('dead');

      release();
      await instance.count();
      await instance.bulkWrite([], 'test');
      await vi.advanceTimersByTimeAsync(STORAGE_READ_WATCHDOG_MS * 2);
      expect(health().status).toBe('dead');
    });

    it('runs no watchdog timer while no reads are pending', async () => {
      let release!: () => void;
      const pending = new Promise<any>((resolve) => { release = () => resolve({ documents: [] }); });
      const { instance, health } = await setup({ query: () => pending });
      expect(vi.getTimerCount()).toBe(0);

      instance.query();
      expect(vi.getTimerCount()).toBe(1);
      release();
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(0);

      await vi.advanceTimersByTimeAsync(STORAGE_READ_WATCHDOG_MS * 3);
      expect(health().status).toBe('ok');
    });
  });

  it('honours writeStallMs and readWatchdogMs', async () => {
    const { instance, health } = await setup({ bulkWrite: never, query: never }, { writeStallMs: 50, readWatchdogMs: 100 });
    instance.bulkWrite([], 'test');
    instance.query();
    await vi.advanceTimersByTimeAsync(50);
    expect(health().status).toBe('stalled');
    await vi.advanceTimersByTimeAsync(150);
    expect(health().status).toBe('dead');
  });

  it('keeps the tallyEngine marker and exposes health$', () => {
    const storage = withStorageWatchdog(fakeStorage());
    expect((storage as any).tallyEngine).toBe('sqlite-sahpool');
    expect(typeof storage.health$.subscribe).toBe('function');
  });

  it('isStorageWorkerFailure recognises a StorageWorkerStartError rejection', () => {
    const startError = new Error('StorageWorkerStartError: the opfs-sahpool worker failed to start its pool');
    startError.name = 'StorageWorkerStartError';
    expect(isStorageWorkerFailure(startError)).toBe(true);

    // Also recognised when the name is embedded mid-message, not just as a
    // prefix — how RxDB's remote storage re-throws it: {"errorName":"StorageWorkerStartError",...}
    const messageOnly = new Error('storage-remote: {"errorName":"StorageWorkerStartError","message":"no OPFS in this browser"}');
    expect(isStorageWorkerFailure(messageOnly)).toBe(true);
    expect(isStorageWorkerFailure(new Error('CONFLICT'))).toBe(false);
  });

  it('STORAGE_WRITE_STALL_MS and STORAGE_READ_WATCHDOG_MS are the WCPOS/ADR-061 values of 10s and 30s', () => {
    expect(STORAGE_WRITE_STALL_MS).toBe(10_000);
    expect(STORAGE_READ_WATCHDOG_MS).toBe(30_000);
  });
});

describe('createTallyDatabase applies withStorageWatchdog automatically', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const schema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: { id: { type: 'string', maxLength: 100 }, name: { type: 'string' } },
    required: ['id'],
  };
  const connector = { id: 'test', schemas: { products: schema } } as unknown as TallyConnector;
  const uniqueName = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  it('wraps a storage marked sqlite-sahpool, and leaves memory storage unwrapped', async () => {
    // Skip the dev-mode ajv wrapper so db.storage is exactly what create-db.ts resolved.
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const { createTallyDatabase, getStorageHealth } = await import('./create-db');
    const { getRxStorageMemory: freshGetRxStorageMemory } = await import('rxdb/plugins/storage-memory');

    const memoryStorage = freshGetRxStorageMemory();
    const memoryDb = await createTallyDatabase({ connector, storage: memoryStorage, name: uniqueName('watchdog_memory') });
    try {
      expect(memoryDb.storage.createStorageInstance).toBe(memoryStorage.createStorageInstance);
      expect(getStorageHealth(memoryDb)).toBeUndefined();
    } finally {
      await memoryDb.close();
    }

    const sqliteStorage = Object.assign(freshGetRxStorageMemory(), { tallyEngine: 'sqlite-sahpool' });
    const rawCreate = sqliteStorage.createStorageInstance;
    const sqliteDb = await createTallyDatabase({ connector, storage: sqliteStorage, name: uniqueName('watchdog_sqlite') });
    try {
      expect(sqliteDb.storage.createStorageInstance).not.toBe(rawCreate);
      expect((sqliteDb.storage as any).tallyEngine).toBe('sqlite-sahpool');
      expect(typeof getStorageHealth(sqliteDb)?.subscribe).toBe('function');
    } finally {
      await sqliteDb.close();
    }
  });

  // RxDB's ajv validator assigns `instance.bulkWrite = …` over the watchdog's
  // instance. #71's Proxy version recursed into a stack overflow here.
  it('in dev mode (ajv validator over the watchdog), inserts, finds and updates without recursing', async () => {
    vi.resetModules();
    const { createTallyDatabase, getStorageHealth } = await import('./create-db');
    const { getRxStorageMemory: freshGetRxStorageMemory } = await import('rxdb/plugins/storage-memory');

    const storage = Object.assign(freshGetRxStorageMemory(), { tallyEngine: 'sqlite-sahpool' });
    const db = await createTallyDatabase({ connector, storage, name: uniqueName('watchdog_devmode') });
    try {
      expect(db.storage.name).toMatch(/^validate-ajv-/);
      await db.products.insert({ id: 'p1', name: 'Mug' });
      const product = await db.products.findOne('p1').exec();
      expect(product?.get('name')).toBe('Mug');
      await product!.incrementalPatch({ name: 'Cup' });
      expect((await db.products.findOne('p1').exec())?.get('name')).toBe('Cup');

      let latest: StorageHealth | undefined;
      getStorageHealth(db)!.subscribe((health) => { latest = health; }).unsubscribe();
      expect(latest).toEqual({ status: 'ok', stalledWrites: 0 });
    } finally {
      await db.close();
    }
  });
});

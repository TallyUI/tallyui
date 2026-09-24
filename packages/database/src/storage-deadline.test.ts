// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import type { RxStorage } from 'rxdb';

import type { TallyConnector } from '@tallyui/core';

import {
  STORAGE_WRITE_DEADLINE_MS,
  StorageWorkerTimeoutError,
  isStorageWorkerTimeout,
  isStorageWorkerFailure,
  withWriteDeadline,
} from './storage-deadline';

// A fake storage whose bulkWrite and/or createStorageInstance can be told
// to never resolve, to exercise the write deadline without a real worker.
function fakeStorage(options: { bulkWrite?: (...args: any[]) => Promise<any>; createStorageInstance?: () => Promise<any> } = {}): RxStorage<any, any> {
  const bulkWrite = options.bulkWrite ?? (async () => ({ success: [], error: [] }));
  return {
    name: 'fake',
    rxdbVersion: '0.0.0',
    tallyEngine: 'sqlite-sahpool',
    async createStorageInstance(params: any) {
      if (options.createStorageInstance) {
        return options.createStorageInstance();
      }
      return {
        databaseName: params.databaseName,
        collectionName: params.collectionName,
        schema: params.schema,
        internals: {},
        options: {},
        bulkWrite,
        query: vi.fn(async () => ({ documents: [] })),
        count: vi.fn(async () => ({ count: 0, mode: 'fast' })),
        findDocumentsById: vi.fn(async () => []),
        getChangedDocumentsSince: vi.fn(async () => ({ documents: [], checkpoint: {} })),
        getAttachmentData: vi.fn(),
        cleanup: vi.fn(async () => true),
        changeStream: () => ({ subscribe: () => ({ unsubscribe() {} }) }),
        close: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
      };
    },
  } as unknown as RxStorage<any, any>;
}

const params = { databaseName: 'd', collectionName: 'c', schema: {}, options: {}, multiInstance: false, devMode: false } as any;

describe('storage-deadline', () => {
  it('a write rejects with StorageWorkerTimeoutError when bulkWrite never resolves', async () => {
    const storage = withWriteDeadline(fakeStorage({ bulkWrite: () => new Promise(() => {}) }), 50);
    const instance = await storage.createStorageInstance(params);
    await expect(instance.bulkWrite([], 'test')).rejects.toThrow(StorageWorkerTimeoutError);
  });

  it('isStorageWorkerTimeout and isStorageWorkerFailure recognise the timeout', async () => {
    const storage = withWriteDeadline(fakeStorage({ bulkWrite: () => new Promise(() => {}) }), 50);
    const instance = await storage.createStorageInstance(params);
    const error = await instance.bulkWrite([], 'test').catch((e: unknown) => e);
    expect(isStorageWorkerTimeout(error)).toBe(true);
    expect(isStorageWorkerFailure(error)).toBe(true);
  });

  it('a normal write passes through untouched', async () => {
    const result = { success: [{ id: 'p1' }], error: [] };
    const storage = withWriteDeadline(fakeStorage({ bulkWrite: async () => result }), 50);
    const instance = await storage.createStorageInstance(params);
    await expect(instance.bulkWrite([], 'test')).resolves.toBe(result);
  });

  it('keeps the tallyEngine marker after wrapping', () => {
    const storage = withWriteDeadline(fakeStorage(), 50);
    expect((storage as any).tallyEngine).toBe('sqlite-sahpool');
  });

  it('a createStorageInstance call that never resolves also rejects with the timeout', async () => {
    const storage = withWriteDeadline(fakeStorage({ createStorageInstance: () => new Promise(() => {}) }), 50);
    await expect(storage.createStorageInstance(params)).rejects.toThrow(StorageWorkerTimeoutError);
  });

  it('isStorageWorkerFailure recognises a StorageWorkerStartError rejection', () => {
    const startError = new Error('StorageWorkerStartError: the opfs-sahpool worker failed to start its pool');
    startError.name = 'StorageWorkerStartError';
    expect(isStorageWorkerFailure(startError)).toBe(true);
    expect(isStorageWorkerTimeout(startError)).toBe(false);

    // Also recognised when the name is embedded mid-message, not just as a
    // prefix — how RxDB's remote storage re-throws it: {"errorName":"StorageWorkerStartError",...}
    const messageOnly = new Error('storage-remote: {"errorName":"StorageWorkerStartError","message":"no OPFS in this browser"}');
    expect(isStorageWorkerFailure(messageOnly)).toBe(true);
  });

  it('STORAGE_WRITE_DEADLINE_MS is the WCPOS/ADR-061 default of 10s', () => {
    expect(STORAGE_WRITE_DEADLINE_MS).toBe(10_000);
  });
});

describe('createTallyDatabase applies withWriteDeadline automatically', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const schema = {
    version: 0,
    primaryKey: 'id',
    type: 'object',
    properties: { id: { type: 'string', maxLength: 100 } },
    required: ['id'],
  };
  const connector = { id: 'test', schemas: { products: schema } } as unknown as TallyConnector;

  it('wraps a storage marked sqlite-sahpool, and leaves memory storage unwrapped', async () => {
    // Skip the dev-mode ajv wrapper so db.storage is exactly what create-db.ts resolved.
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const { createTallyDatabase } = await import('./create-db');
    const { getRxStorageMemory: freshGetRxStorageMemory } = await import('rxdb/plugins/storage-memory');

    const memoryStorage = freshGetRxStorageMemory();
    const memoryDb = await createTallyDatabase({
      connector,
      storage: memoryStorage,
      name: `deadline_memory_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    });
    try {
      expect(memoryDb.storage.createStorageInstance).toBe(memoryStorage.createStorageInstance);
    } finally {
      await memoryDb.close();
    }

    const sqliteStorage = Object.assign(freshGetRxStorageMemory(), { tallyEngine: 'sqlite-sahpool' });
    const rawCreate = sqliteStorage.createStorageInstance;
    const sqliteDb = await createTallyDatabase({
      connector,
      storage: sqliteStorage,
      name: `deadline_sqlite_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    });
    try {
      expect(sqliteDb.storage.createStorageInstance).not.toBe(rawCreate);
      expect((sqliteDb.storage as any).tallyEngine).toBe('sqlite-sahpool');
    } finally {
      await sqliteDb.close();
    }
  });
});

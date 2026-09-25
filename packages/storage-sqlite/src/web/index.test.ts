// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Subject } from 'rxjs';
import { getRxStorageRemote, MESSAGE_CHANNEL_CACHE_BY_IDENTIFIER } from 'rxdb/plugins/storage-remote';

const { getRxStorageWorker, fakeStorage } = vi.hoisted(() => {
  const fakeStorage = { remote: true };
  return { getRxStorageWorker: vi.fn((_settings: any): any => fakeStorage), fakeStorage };
});

vi.mock('rxdb-premium/plugins/storage-worker', () => ({ getRxStorageWorker }));

import { getRxStorageSQLiteWasm, SQLITE_SAHPOOL_ENGINE, StorageWorkerStartError, isStorageWorkerStartError } from './index';

/**
 * Premium's mode 'one' as 16.21.1 builds it: rxdb's real storage-remote,
 * identified by `'rx-storage-worker-' + workerInput`, whose constructor gets
 * the kept-alive channel from the real cache, creating the worker on a miss.
 */
function premiumLike(settings: any) {
  return getRxStorageRemote({
    identifier: 'rx-storage-worker-' + settings.workerInput,
    mode: settings.mode,
    messageChannelCreator() {
      settings.workerInput();
      return Promise.resolve({ messages$: new Subject<any>(), send() {}, close: () => Promise.resolve() });
    },
  });
}

/** Stands in for the browser's Worker: construct-only, and terminate() never throws, as in Chromium. */
const created: FakeWorker[] = [];
class FakeWorker {
  terminate = vi.fn();
  constructor(
    readonly input: string | URL,
    readonly options: WorkerOptions,
  ) {
    created.push(this);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  getRxStorageWorker.mockImplementation(() => fakeStorage);
  created.length = 0;
});

describe('getRxStorageSQLiteWasm', () => {
  it('passes mode: one, type: module and a worker factory keyed by the input to getRxStorageWorker', () => {
    const result = getRxStorageSQLiteWasm({ workerInput: 'worker.js' });

    expect(getRxStorageWorker).toHaveBeenLastCalledWith({
      workerInput: expect.any(Function),
      workerOptions: { type: 'module', name: 'tallyui-storage' },
      mode: 'one',
    });
    // Premium's cache identifier is built from String(workerInput).
    expect(String(getRxStorageWorker.mock.lastCall![0].workerInput)).toBe('worker.js');
    expect(result).toBe(fakeStorage);
    expect(result.tallyEngine).toBe('sqlite-sahpool');
  });

  it('exports the engine constant', () => {
    expect(SQLITE_SAHPOOL_ENGINE).toBe('sqlite-sahpool');
  });

  it('uses a custom workerName when given', () => {
    getRxStorageSQLiteWasm({ workerInput: 'w.js', workerName: 'custom' });

    expect(getRxStorageWorker).toHaveBeenLastCalledWith({
      workerInput: expect.any(Function),
      workerOptions: { type: 'module', name: 'custom' },
      mode: 'one',
    });
  });

  it('re-exports the worker start error helpers', () => {
    expect(typeof StorageWorkerStartError).toBe('function');
    expect(typeof isStorageWorkerStartError).toBe('function');
  });
});

describe('terminate()', () => {
  it('terminates the worker it created, with its type and name, and is idempotent', () => {
    vi.stubGlobal('Worker', FakeWorker);
    getRxStorageWorker.mockImplementationOnce(premiumLike);

    const storage = getRxStorageSQLiteWasm({ workerInput: 'idempotent.js', workerName: 'pos' });
    expect(created).toHaveLength(1);
    expect(created[0]!.input).toBe('idempotent.js');
    expect(created[0]!.options).toEqual({ type: 'module', name: 'pos' });

    storage.terminate();
    expect(() => storage.terminate()).not.toThrow();
    expect(created[0]!.terminate).toHaveBeenCalledTimes(1);
  });

  it('evicts the cached channel, so the next storage from the same input starts a new worker', () => {
    vi.stubGlobal('Worker', FakeWorker);
    getRxStorageWorker.mockImplementation(premiumLike);

    const first = getRxStorageSQLiteWasm({ workerInput: 'evict.js' });
    // Without the eviction, mode 'one' reuses the cached channel and its worker.
    getRxStorageSQLiteWasm({ workerInput: 'evict.js' });
    expect(created).toHaveLength(1);

    first.terminate();
    expect(MESSAGE_CHANNEL_CACHE_BY_IDENTIFIER.get('rx-storage-worker-evict.js')?.size).toBe(0);
    const next = getRxStorageSQLiteWasm({ workerInput: 'evict.js' });
    expect(created).toHaveLength(2);
    next.terminate();
    expect(created[1]!.terminate).toHaveBeenCalledTimes(1);
  });

  it("uses the caller's factory, and terminates the worker it returned", () => {
    getRxStorageWorker.mockImplementationOnce(premiumLike);
    const worker = { terminate: vi.fn() } as unknown as Worker;
    const factory = vi.fn(() => worker);

    const storage = getRxStorageSQLiteWasm({ workerInput: factory });
    expect(factory).toHaveBeenCalledTimes(1);
    expect(String(getRxStorageWorker.mock.lastCall![0].workerInput)).toBe(String(factory));

    storage.terminate();
    storage.terminate();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});

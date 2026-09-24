// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const {
  sqlite3InitModule,
  installOpfsSAHPoolVfs,
  getRxStorageSQLite,
  exposeWorkerRxStorage,
  fakeStorage,
  realCreateStorageInstance,
} = vi.hoisted(() => {
  const realCreateStorageInstance = vi.fn(async (params: unknown) => ({ params, instance: 'real' }));
  const fakeStorage = {
    fake: 'storage',
    name: 'fake-sqlite',
    rxdbVersion: '16.21.1',
    createStorageInstance: realCreateStorageInstance,
  };
  return {
    sqlite3InitModule: vi.fn(),
    installOpfsSAHPoolVfs: vi.fn(),
    getRxStorageSQLite: vi.fn(() => fakeStorage),
    exposeWorkerRxStorage: vi.fn(),
    fakeStorage,
    realCreateStorageInstance,
  };
});

vi.mock('@sqlite.org/sqlite-wasm', () => ({ default: sqlite3InitModule }));
vi.mock('rxdb-premium/plugins/storage-sqlite', () => ({ getRxStorageSQLite }));
vi.mock('rxdb-premium/plugins/storage-worker', () => ({ exposeWorkerRxStorage }));

describe('web worker entry', () => {
  beforeEach(() => {
    vi.resetModules();
    sqlite3InitModule.mockReset();
    installOpfsSAHPoolVfs.mockReset();
    getRxStorageSQLite.mockClear();
    exposeWorkerRxStorage.mockClear();
    realCreateStorageInstance.mockClear();
  });

  it('exposes the storage before sqlite3InitModule resolves, so RxDB\'s first message is never dropped', async () => {
    const order: string[] = [];
    const deferred = createDeferred<{ installOpfsSAHPoolVfs: typeof installOpfsSAHPoolVfs }>();
    sqlite3InitModule.mockImplementation(() => {
      order.push('sqlite3InitModule called');
      return deferred.promise;
    });
    exposeWorkerRxStorage.mockImplementation(() => order.push('exposeWorkerRxStorage called'));

    await import('./worker');

    // The module's synchronous body has already finished, and
    // exposeWorkerRxStorage has already run, even though sqlite3InitModule's
    // promise is still pending: this is what lets the worker's listener
    // exist before RxDB's first message arrives.
    expect(order).toEqual(['sqlite3InitModule called', 'exposeWorkerRxStorage called']);
    expect(sqlite3InitModule).toHaveBeenCalledTimes(1);

    deferred.resolve({ installOpfsSAHPoolVfs });
  });

  it('waits for the pool, then delegates to the real storage', async () => {
    const pool = { OpfsSAHPoolDb: class {} };
    sqlite3InitModule.mockResolvedValue({ installOpfsSAHPoolVfs });
    installOpfsSAHPoolVfs.mockResolvedValue(pool);

    await import('./worker');
    const { storage } = exposeWorkerRxStorage.mock.calls[0][0];
    expect(storage.name).toBe(fakeStorage.name);
    expect(storage.rxdbVersion).toBe(fakeStorage.rxdbVersion);

    const params = { some: 'params' };
    const result = await storage.createStorageInstance(params);

    expect(installOpfsSAHPoolVfs).toHaveBeenCalledWith({ name: 'tallyui', initialCapacity: 64 });
    expect(realCreateStorageInstance).toHaveBeenCalledWith(params);
    expect(result).toEqual({ params, instance: 'real' });
  });

  it('rejects createStorageInstance with StorageWorkerStartError when the pool install fails', async () => {
    const cause = new Error('no OPFS in this browser');
    sqlite3InitModule.mockResolvedValue({ installOpfsSAHPoolVfs });
    installOpfsSAHPoolVfs.mockRejectedValue(cause);

    await import('./worker');
    const { storage } = exposeWorkerRxStorage.mock.calls[0][0];

    await expect(storage.createStorageInstance({})).rejects.toMatchObject({
      name: 'StorageWorkerStartError',
      cause,
    });
    expect(realCreateStorageInstance).not.toHaveBeenCalled();
  });

  it('raises no unhandled rejection when the pool install fails and createStorageInstance is never called', async () => {
    const cause = new Error('no OPFS in this browser');
    sqlite3InitModule.mockResolvedValue({ installOpfsSAHPoolVfs });
    installOpfsSAHPoolVfs.mockRejectedValue(cause);

    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      await import('./worker');
      // Let the rejected `ready` promise settle before checking for an unhandled rejection.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});

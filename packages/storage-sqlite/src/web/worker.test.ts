// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { sqlite3InitModule, installOpfsSAHPoolVfs, getRxStorageSQLite, exposeWorkerRxStorage, fakeStorage } =
  vi.hoisted(() => {
    const fakeStorage = { fake: 'storage', name: 'fake-sqlite', rxdbVersion: '16.21.1' };
    return {
      sqlite3InitModule: vi.fn(),
      installOpfsSAHPoolVfs: vi.fn(),
      getRxStorageSQLite: vi.fn(() => fakeStorage),
      exposeWorkerRxStorage: vi.fn(),
      fakeStorage,
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
  });

  it('installs the opfs-sahpool VFS and exposes the storage', async () => {
    const pool = { OpfsSAHPoolDb: class {} };
    sqlite3InitModule.mockResolvedValue({ installOpfsSAHPoolVfs });
    installOpfsSAHPoolVfs.mockResolvedValue(pool);

    await import('./worker');

    expect(sqlite3InitModule).toHaveBeenCalledTimes(1);
    expect(installOpfsSAHPoolVfs).toHaveBeenCalledWith({ name: 'tallyui', initialCapacity: 64 });
    expect(getRxStorageSQLite).toHaveBeenCalledTimes(1);
    expect(exposeWorkerRxStorage).toHaveBeenCalledWith({ storage: fakeStorage });
  });

  it('exposes a failing storage instead of hanging when the pool fails to install', async () => {
    const cause = new Error('no OPFS in this browser');
    sqlite3InitModule.mockResolvedValue({ installOpfsSAHPoolVfs });
    installOpfsSAHPoolVfs.mockRejectedValue(cause);

    await import('./worker');

    expect(exposeWorkerRxStorage).toHaveBeenCalledTimes(1);
    const { storage } = exposeWorkerRxStorage.mock.calls[0][0];
    // name/rxdbVersion are copied from the real storage type.
    expect(storage.name).toBe(fakeStorage.name);
    expect(storage.rxdbVersion).toBe(fakeStorage.rxdbVersion);
    await expect(storage.createStorageInstance()).rejects.toMatchObject({
      name: 'StorageWorkerStartError',
      cause,
    });
  });
});

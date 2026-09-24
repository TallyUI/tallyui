// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

const { sqlite3InitModule, installOpfsSAHPoolVfs, getRxStorageSQLite, exposeWorkerRxStorage, fakeStorage } =
  vi.hoisted(() => {
    const fakeStorage = { fake: 'storage' };
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
});

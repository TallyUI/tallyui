// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

const { getRxStorageWorker, fakeStorage } = vi.hoisted(() => {
  const fakeStorage = { remote: true };
  return { getRxStorageWorker: vi.fn(() => fakeStorage), fakeStorage };
});

vi.mock('rxdb-premium/plugins/storage-worker', () => ({ getRxStorageWorker }));

import { getRxStorageSQLiteWasm, SQLITE_SAHPOOL_ENGINE, StorageWorkerStartError, isStorageWorkerStartError } from './index';

describe('getRxStorageSQLiteWasm', () => {
  it('passes mode: one and type: module to getRxStorageWorker', () => {
    const workerInput = 'worker.js';

    const result = getRxStorageSQLiteWasm({ workerInput });

    expect(getRxStorageWorker).toHaveBeenCalledWith({
      workerInput,
      workerOptions: { type: 'module', name: 'tallyui-storage' },
      mode: 'one',
    });
    expect(result).toBe(fakeStorage);
    expect((result as unknown as { tallyEngine: string }).tallyEngine).toBe('sqlite-sahpool');
  });

  it('exports the engine constant', () => {
    expect(SQLITE_SAHPOOL_ENGINE).toBe('sqlite-sahpool');
  });

  it('uses a custom workerName when given', () => {
    getRxStorageSQLiteWasm({ workerInput: 'w.js', workerName: 'custom' });

    expect(getRxStorageWorker).toHaveBeenCalledWith({
      workerInput: 'w.js',
      workerOptions: { type: 'module', name: 'custom' },
      mode: 'one',
    });
  });

  it('re-exports the worker start error helpers', () => {
    expect(typeof StorageWorkerStartError).toBe('function');
    expect(typeof isStorageWorkerStartError).toBe('function');
  });
});

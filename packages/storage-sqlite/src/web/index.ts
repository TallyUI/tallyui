import type { RxStorage } from 'rxdb';
import { getRxStorageWorker } from 'rxdb-premium/plugins/storage-worker';

export { StorageWorkerStartError, isStorageWorkerStartError } from './errors';

/** Marks a storage as this package's web engine (ADR-061), for job 2b to recognise. */
export const SQLITE_SAHPOOL_ENGINE = 'sqlite-sahpool';

/** The web storage (ADR-061): premium SQLite on sqlite-wasm opfs-sahpool, in one dedicated worker. */
export function getRxStorageSQLiteWasm(options: {
  workerInput: string | URL | (() => Worker);
  workerName?: string;
}): RxStorage<any, any> {
  const storage = getRxStorageWorker({
    workerInput: options.workerInput,
    workerOptions: { type: 'module', name: options.workerName ?? 'tallyui-storage' },
    mode: 'one',
  });
  return Object.assign(storage, { tallyEngine: SQLITE_SAHPOOL_ENGINE });
}

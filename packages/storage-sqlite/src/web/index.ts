import type { RxStorage } from 'rxdb';
import { MESSAGE_CHANNEL_CACHE_BY_IDENTIFIER, OPEN_REMOTE_MESSAGE_CHANNELS } from 'rxdb/plugins/storage-remote';
import { getRxStorageWorker } from 'rxdb-premium/plugins/storage-worker';

export { StorageWorkerStartError, isStorageWorkerStartError } from './errors';

/** Marks a storage as this package's web engine (ADR-061), for job 2b to recognise. */
export const SQLITE_SAHPOOL_ENGINE = 'sqlite-sahpool';

/** The web storage, with `terminate()` for the live-tab park order (ADR-061, amendment 1). */
export type RxStorageSQLiteWasm = RxStorage<any, any> & {
  tallyEngine: string;
  /**
   * Terminates the storage worker, which releases the opfs-sahpool access
   * handles, and evicts its channel from rxdb's cache, so a new storage built
   * the same way starts a fresh worker. Call it after the databases close.
   * Idempotent. Build one storage per page life (ADR-061): a second storage
   * from the same input while the first is alive shares its worker, and only
   * the storage that created the worker can terminate it.
   */
  terminate(): void;
};

/** The web storage (ADR-061): premium SQLite on sqlite-wasm opfs-sahpool, in one dedicated worker. */
export function getRxStorageSQLiteWasm(options: {
  workerInput: string | URL | (() => Worker);
  workerName?: string;
}): RxStorageSQLiteWasm {
  const { workerInput } = options;
  const workerOptions = { type: 'module' as const, name: options.workerName ?? 'tallyui-storage' };
  // Premium creates the worker inside its own closure, out of reach, so this
  // creates it instead and holds the reference that terminate() needs.
  let worker: Worker | undefined;
  const createWorker = () =>
    (worker = typeof workerInput === 'function' ? workerInput() : new Worker(workerInput, workerOptions));
  // Premium's cache identifier is `'rx-storage-worker-' + workerInput`: keep
  // it the caller's input, not this closure's source text.
  createWorker.toString = () => String(workerInput);
  const storage = getRxStorageWorker({ workerInput: createWorker, workerOptions, mode: 'one' });
  let terminated = false;
  return Object.assign(storage, {
    tallyEngine: SQLITE_SAHPOOL_ENGINE,
    terminate() {
      if (terminated) return;
      terminated = true;
      worker?.terminate();
      // Mode 'one' keeps its channel alive forever in rxdb's storage-remote
      // cache, keyed by the identifier above. Left there, the next storage
      // built from the same input reuses the dead channel, and every call hangs.
      const channel = storage.messageChannelIfOneMode;
      const cache = MESSAGE_CHANNEL_CACHE_BY_IDENTIFIER.get(storage.settings.identifier);
      cache?.forEach((item, key) => {
        if (item.messageChannel === channel) cache.delete(key);
      });
      // A worker that never started, or a close that fails, has nothing left to release.
      void channel?.then((open) => {
        OPEN_REMOTE_MESSAGE_CHANNELS.delete(open);
        return open.close();
      }).catch(() => {});
    },
  });
}

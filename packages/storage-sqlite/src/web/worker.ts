import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { RxStorage } from 'rxdb';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';
import { getRxStorageSQLite } from 'rxdb-premium/plugins/storage-sqlite';
import { exposeWorkerRxStorage } from 'rxdb-premium/plugins/storage-worker';
import { getSQLiteBasicsOpfsSahPool, type Oo1Db } from './sqlite-basics-sahpool';
import { StorageUnavailableError, StorageWorkerStartError } from './errors';

// What a pool install rejects with while another tab holds the pool (#293): WebKit's, then Chromium's.
const HELD_ERROR_NAMES = ['InvalidStateError', 'NoModificationAllowedError'];

// Only the message crosses RxDB's worker channel, so each start error carries its cause's name and message.
const describeCause = (cause: unknown) => (cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause));

// A private window (WebKit's ephemeral storage, #293) rejects getDirectory(), and a browser without sync access
// handles can't host the pool: the storage is unavailable, whatever other tabs do.
async function requireOpfs(): Promise<void> {
  try {
    const handle = globalThis.FileSystemFileHandle?.prototype ?? {};
    if (!('createSyncAccessHandle' in handle)) throw new TypeError('FileSystemFileHandle.createSyncAccessHandle is missing');
    await navigator.storage.getDirectory();
  } catch (cause) {
    const why = `this browser gives the page no OPFS storage (a private window?): ${describeCause(cause)}`;
    throw new StorageUnavailableError(`StorageUnavailableError: ${why}`, { cause });
  }
}

// The worker is its own JS context with its own RxDB globals, so it sets
// RxDB 17's premium flag itself (13-collection cap otherwise).
setPremiumFlag();

// This must run inside a dedicated worker (ADR-061): `createSyncAccessHandle`,
// which opfs-sahpool needs, exists only there, not on the main thread or in
// a shared worker. opfs-sahpool also holds exclusive access handles for the
// whole origin, so once this worker has the pool open, a second tab cannot
// open it at all; ADR-061 makes one live tab, one dedicated worker, the
// supported topology and a reload the recovery from a dead or hung worker.
//
// `exposeWorkerRxStorage` below must run synchronously, at module start,
// before the pool install is even awaited: in real Chromium, RxDB's first
// message (creating the storage instance) arrives well before start-up
// finishes, and a worker that isn't listening yet drops it, hanging every
// cold start.

// A throwaway instance gives `name`/`rxdbVersion` without awaiting anything;
// its `openDb` is never called, since only `ready` below opens a real pool.
const { name, rxdbVersion } = getRxStorageSQLite({
  sqliteBasics: getSQLiteBasicsOpfsSahPool({ openDb: () => Promise.reject(new Error('unused: throwaway instance')) }),
});

const ready: Promise<RxStorage<any, any>> = Promise.all([sqlite3InitModule(), requireOpfs()])
  .then(([sqlite3]) => sqlite3.installOpfsSAHPoolVfs({ name: 'tallyui', initialCapacity: 64 }))
  .then((pool) =>
    getRxStorageSQLite({
      sqliteBasics: getSQLiteBasicsOpfsSahPool({
        // The OO1 `exec()` here is the real, overloaded sqlite-wasm signature;
        // `Oo1Db` is the minimal shape this package's adapters need from it.
        openDb: async (dbName) => new pool.OpfsSAHPoolDb('/' + dbName) as unknown as Oo1Db,
      }),
    })
  );
// A pool install failure before any createStorageInstance call would otherwise be an unhandled rejection; createStorageInstance below still surfaces it as a start error.
ready.catch(() => {});

const storage: RxStorage<any, any> = {
  name,
  rxdbVersion,
  createStorageInstance: async (params) => {
    let realStorage: RxStorage<any, any>;
    try {
      realStorage = await ready;
    } catch (cause) {
      // Start-up failed: fail every call instead of hanging it forever. With OPFS reachable, a refused
      // pool install means another tab holds it; any other failure keeps its cause for diagnosis.
      if (cause instanceof StorageUnavailableError) throw cause;
      const held = HELD_ERROR_NAMES.includes((cause as Error | undefined)?.name ?? '');
      const what = held ? 'another tab holds the database (opfs-sahpool)' : 'SQLite worker start failed';
      throw new StorageWorkerStartError(`StorageWorkerStartError: ${what}: ${describeCause(cause)}`, { cause });
    }
    return realStorage.createStorageInstance(params);
  },
};

exposeWorkerRxStorage({ storage });

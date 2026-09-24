import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { RxStorage } from 'rxdb';
import { getRxStorageSQLite } from 'rxdb-premium/plugins/storage-sqlite';
import { exposeWorkerRxStorage } from 'rxdb-premium/plugins/storage-worker';
import { getSQLiteBasicsOpfsSahPool, type Oo1Db } from './sqlite-basics-sahpool';
import { StorageWorkerStartError } from './errors';

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

const ready: Promise<RxStorage<any, any>> = sqlite3InitModule()
  .then((sqlite3) => sqlite3.installOpfsSAHPoolVfs({ name: 'tallyui', initialCapacity: 64 }))
  .then((pool) =>
    getRxStorageSQLite({
      sqliteBasics: getSQLiteBasicsOpfsSahPool({
        // The OO1 `exec()` here is the real, overloaded sqlite-wasm signature;
        // `Oo1Db` is the minimal shape this package's adapters need from it.
        openDb: async (dbName) => new pool.OpfsSAHPoolDb('/' + dbName) as unknown as Oo1Db,
      }),
    })
  );

const storage: RxStorage<any, any> = {
  name,
  rxdbVersion,
  createStorageInstance: async (params) => {
    let realStorage: RxStorage<any, any>;
    try {
      realStorage = await ready;
    } catch (cause) {
      // The pool failed to install: another tab may hold it, or there's no OPFS
      // or sync access handles. Fail every call instead of hanging it forever.
      throw new StorageWorkerStartError(
        'SQLite worker start failed: another tab may hold the database, or this browser lacks OPFS.',
        { cause }
      );
    }
    return realStorage.createStorageInstance(params);
  },
};

exposeWorkerRxStorage({ storage });

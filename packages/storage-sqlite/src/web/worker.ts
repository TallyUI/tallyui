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

let storage: RxStorage<any, any>;
try {
  const sqlite3 = await sqlite3InitModule();
  const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'tallyui', initialCapacity: 64 });
  storage = getRxStorageSQLite({
    sqliteBasics: getSQLiteBasicsOpfsSahPool({
      // The OO1 `exec()` here is the real, overloaded sqlite-wasm signature;
      // `Oo1Db` is the minimal shape this package's adapters need from it.
      openDb: async (name) => new pool.OpfsSAHPoolDb('/' + name) as unknown as Oo1Db,
    }),
  });
} catch (cause) {
  // The pool failed to install: another tab may hold it, or there's no OPFS
  // or sync access handles. Fail every call instead of hanging it forever.
  const { name, rxdbVersion } = getRxStorageSQLite({
    sqliteBasics: getSQLiteBasicsOpfsSahPool({ openDb: () => Promise.reject(cause) }),
  });
  storage = {
    name,
    rxdbVersion,
    createStorageInstance: () =>
      Promise.reject(
        new StorageWorkerStartError(
          'SQLite worker start failed: another tab may hold the database, or this browser lacks OPFS.',
          { cause }
        )
      ),
  };
}
exposeWorkerRxStorage({ storage });

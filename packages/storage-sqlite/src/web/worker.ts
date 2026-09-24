import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { getRxStorageSQLite } from 'rxdb-premium/plugins/storage-sqlite';
import { exposeWorkerRxStorage } from 'rxdb-premium/plugins/storage-worker';
import { getSQLiteBasicsOpfsSahPool, type Oo1Db } from './sqlite-basics-sahpool';

// This must run inside a dedicated worker (ADR-061): `createSyncAccessHandle`,
// which opfs-sahpool needs, exists only there, not on the main thread or in
// a shared worker. opfs-sahpool also holds exclusive access handles for the
// whole origin, so once this worker has the pool open, a second tab cannot
// open it at all; ADR-061 makes one live tab, one dedicated worker, the
// supported topology and a reload the recovery from a dead or hung worker.

const sqlite3 = await sqlite3InitModule();
const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'tallyui', initialCapacity: 64 });
const storage = getRxStorageSQLite({
  sqliteBasics: getSQLiteBasicsOpfsSahPool({
    // The OO1 `exec()` here is the real, overloaded sqlite-wasm signature;
    // `Oo1Db` is the minimal shape this package's adapters need from it.
    openDb: async (name) => new pool.OpfsSAHPoolDb('/' + name) as unknown as Oo1Db,
  }),
});
exposeWorkerRxStorage({ storage });

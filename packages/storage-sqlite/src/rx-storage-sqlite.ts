import type { RxStorage } from 'rxdb';
import type { SQLiteBasics } from 'rxdb/plugins/storage-sqlite';
import { getRxStorageSQLite as getPremiumRxStorageSQLite } from 'rxdb-premium/plugins/storage-sqlite';
import type { SQLiteDatabase } from './types';

/**
 * Wraps a synchronous SQLite handle with RxDB Premium SQLite storage.
 * Apps install the RxDB Premium peer dependency under their own RxDB Premium licence.
 * One SQLite handle serves exactly one RxDB database.
 */
export function getRxStorageSQLite(database: SQLiteDatabase): RxStorage<any, any> {
  let databaseName: string | undefined;
  const sqliteBasics: SQLiteBasics<SQLiteDatabase> = {
    debugId: 'tallyui-sqlite-sync',
    journalMode: 'WAL',
    open: (name) => {
      if (databaseName !== undefined && databaseName !== name) {
        throw new Error(`one SQLite handle serves exactly one RxDB database: "${databaseName}" and "${name}"`);
      }
      databaseName = name;
      return Promise.resolve(database);
    },
    all: async (db, q) => {
      const params = q.params.map((param) => typeof param === 'boolean' ? Number(param) : param);
      return db.getAllSync(q.query, params);
    },
    run: async (db, q) => {
      const params = q.params.map((param) => typeof param === 'boolean' ? Number(param) : param);
      db.runSync(q.query, params);
    },
    setPragma: async (db, key, value) => {
      db.execSync('pragma ' + key + ' = ' + value + ';');
    },
    close: async () => {
      // The caller opened the handle and owns its lifetime.
    },
  };
  return getPremiumRxStorageSQLite({ sqliteBasics });
}

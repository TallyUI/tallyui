import type { RxStorage, RxStorageInstanceCreationParams } from 'rxdb';
import { ensureRxStorageInstanceParamsAreCorrect } from 'rxdb';
import { RXDB_VERSION } from 'rxdb/plugins/utils';
import type { SQLiteDatabase, SQLiteStorageSettings } from './types';
import {
  createSQLiteStorageInstance,
  type SQLiteStorageInternals,
} from './storage-instance';

export type RxStorageSQLite = RxStorage<SQLiteStorageInternals, SQLiteStorageSettings>;

export function getRxStorageSQLite(
  database: SQLiteDatabase
): RxStorageSQLite {
  const storage: RxStorageSQLite = {
    name: 'sqlite',
    rxdbVersion: RXDB_VERSION,
    createStorageInstance(params: RxStorageInstanceCreationParams<any, SQLiteStorageSettings>) {
      ensureRxStorageInstanceParamsAreCorrect(params);
      return createSQLiteStorageInstance(storage, params, database);
    },
  };
  return storage;
}

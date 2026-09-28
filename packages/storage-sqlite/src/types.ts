import type { SQLResultRow } from 'rxdb/plugins/storage-sqlite';

export interface SQLiteDatabase {
  execSync(source: string): void;
  getAllSync(source: string, params: (string | number)[]): SQLResultRow[];
  runSync(source: string, params: (string | number)[]): unknown;
}

export interface SQLiteStorageSettings {
  database: SQLiteDatabase;
}

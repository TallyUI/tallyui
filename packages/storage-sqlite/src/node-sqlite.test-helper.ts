import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from './types';

export function openNodeSQLite(): { database: SQLiteDatabase; raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  const database: SQLiteDatabase = {
    execSync: (sql) => raw.exec(sql),
    getAllSync: <T>(sql: string, params: any[] = []) => raw.prepare(sql).all(...params) as T[],
    runSync: (sql, params = []) => {
      const result = raw.prepare(sql).run(...params);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
  };
  return { database, raw };
}

export async function loadSQLiteStorage() {
  try {
    await import('rxdb-premium/plugins/storage-sqlite');
  } catch {
    if (!process.env.CI) {
      console.warn('rxdb-premium is not installed (installing it needs the RXDB_PREMIUM token, see docs/CONTRIBUTING.md); skipping @tallyui/storage-sqlite tests.');
    }
    return undefined;
  }
  return (await import('./rx-storage-sqlite')).getRxStorageSQLite;
}

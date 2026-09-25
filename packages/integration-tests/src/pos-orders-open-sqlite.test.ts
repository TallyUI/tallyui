// @vitest-environment node
// `addPosOrderCollection` on SQLite, the production storage, where a close can interrupt a
// migration that RxDB's own open path leaves running (ADR-032 amendment 2), from version 0 and 1.
import { describe, it } from 'vitest';
import { addPosOrderCollectionTests } from '@tallyui/pos/pos-order/open.test-helper';
import { loadSQLiteStorage, openNodeSQLite } from '@tallyui/storage-sqlite/node-sqlite.test-helper';

const getRxStorageSQLite = await loadSQLiteStorage();
if (!getRxStorageSQLite && process.env.CI) {
  it('requires rxdb-premium in CI', () => { throw new Error('rxdb-premium is missing in CI'); });
}

// One SQLite handle per test: it serves one database name.
(getRxStorageSQLite ? describe : describe.skip)('addPosOrderCollection on SQLite storage', () =>
  addPosOrderCollectionTests(() => getRxStorageSQLite!(openNodeSQLite().database), { sqlite: true }));

// The same tests from version 1 (a version-1 order carries its sessionId) to version 2.
(getRxStorageSQLite ? describe : describe.skip)('addPosOrderCollection on SQLite storage from version 1', () =>
  addPosOrderCollectionTests(() => getRxStorageSQLite!(openNodeSQLite().database), { sqlite: true, from: 1 }));

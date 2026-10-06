// @vitest-environment node
import { afterEach, describe, it } from 'vitest';
import { addRegisterSessionCollectionTests } from '@tallyui/pos/register/open.test-helper';
import { loadSQLiteStorage, openNodeSQLite } from '@tallyui/storage-sqlite/node-sqlite.test-helper';

const getRxStorageSQLite = await loadSQLiteStorage();
if (!getRxStorageSQLite && process.env.CI) {
  it('requires rxdb-premium in CI', () => { throw new Error('rxdb-premium is missing in CI'); });
}

(getRxStorageSQLite ? describe : describe.skip)('addRegisterSessionCollection on SQLite storage', () => {
  let handle: ReturnType<typeof openNodeSQLite>;
  afterEach(() => { handle?.raw.close(); });
  // One SQLite handle per test: all opens and raw reads share this database.
  addRegisterSessionCollectionTests(() => {
    handle = openNodeSQLite();
    return getRxStorageSQLite!(handle.database);
  });
});

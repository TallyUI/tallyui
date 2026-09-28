import { describe, it } from 'vitest';
import type { openNodeSQLite } from './node-sqlite.test-helper';
import { getRxStorageSQLite } from './rx-storage-sqlite';

declare const nodeDatabase: ReturnType<typeof openNodeSQLite>['database'];
const missingRunSync = { execSync: () => {}, getAllSync: () => [] };

describe('SQLite handle types', () => {
  it('accepts the wrapped node:sqlite handle', () => {
    getRxStorageSQLite(nodeDatabase);
  });

  it('requires runSync', () => {
    // @ts-expect-error A handle without runSync cannot execute writes.
    getRxStorageSQLite(missingRunSync);
  });
});

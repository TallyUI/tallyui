// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase, hasPremiumFlag, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { loadSQLiteStorage, openNodeSQLite } from './node-sqlite.test-helper';

// A spy over the real `setPremiumFlag`: vitest.setup.ts has already set the flag, and RxDB caches
// its first check, so only the call itself shows that `getRxStorageSQLite` sets it.
const setPremiumFlag = vi.hoisted(() => vi.fn());
vi.mock('rxdb-premium/plugins/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('rxdb-premium/plugins/shared')>();
  setPremiumFlag.mockImplementation(actual.setPremiumFlag);
  return { ...actual, setPremiumFlag };
});

const getRxStorageSQLite = await loadSQLiteStorage();
if (!getRxStorageSQLite && process.env.CI) {
  it('requires rxdb-premium in CI', () => { throw new Error('rxdb-premium is missing in CI'); });
}

addRxPlugin(RxDBDevModePlugin);

(getRxStorageSQLite ? describe : describe.skip)('SQLite sync adapter', () => {
  let sqlite: ReturnType<typeof openNodeSQLite>;
  let db: RxDatabase;

  beforeEach(async () => {
    sqlite = openNodeSQLite();
    const storage = wrappedValidateAjvStorage({ storage: getRxStorageSQLite!(sqlite.database) });
    db = await createRxDatabase({
      name: 'adapter_test_' + Date.now(),
      storage,
      multiInstance: false,
    });
    await db.addCollections({
      items: {
        schema: {
          version: 0,
          primaryKey: 'id',
          type: 'object',
          properties: {
            id: { type: 'string', maxLength: 100 },
            active: { type: 'boolean' },
          },
          required: ['id', 'active'],
        },
      },
    });
  });

  afterEach(async () => {
    if (db) await db.close();
    sqlite.raw.close();
  });

  it('sets the RxDB premium flag, so the 13-collection cap never applies', async () => {
    setPremiumFlag.mockClear();
    getRxStorageSQLite!(sqlite.database);
    expect(setPremiumFlag).toHaveBeenCalledTimes(1);
    expect(await hasPremiumFlag()).toBe(true);
  });

  it('rejects a second RxDB database name on the same SQLite handle', async () => {
    const secondName = db.name + '_second';
    await expect(createRxDatabase({
      name: secondName,
      storage: db.storage,
      multiInstance: false,
    })).rejects.toThrow(`one SQLite handle serves exactly one RxDB database: "${db.name}" and "${secondName}"`);
  });

  it('keeps the caller-owned raw handle usable after the RxDB database closes', async () => {
    await db.close();
    expect(sqlite.raw.prepare('SELECT 1 AS one').get()).toEqual({ one: 1 });
  });

  it('round-trips boolean fields and queries by active: true', async () => {
    await db.items.bulkInsert([{ id: 'active', active: true }, { id: 'inactive', active: false }]);
    expect((await db.items.findOne('active').exec())?.active).toBe(true);
    expect((await db.items.findOne('inactive').exec())?.active).toBe(false);
    const active = await db.items.find({ selector: { active: true } }).exec();
    expect(active.map((doc: { id: string }) => doc.id)).toEqual(['active']);
  });
});

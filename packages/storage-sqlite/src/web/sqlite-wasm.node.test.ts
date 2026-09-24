// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRxDatabase, addRxPlugin, type RxDatabase, type RxCollection } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { getSQLiteBasicsOpfsSahPool, type Oo1Db } from './sqlite-basics-sahpool';

async function loadRealSQLiteStorage() {
  let sqlite3InitModule: (typeof import('@sqlite.org/sqlite-wasm'))['default'];
  let getRxStorageSQLite: (typeof import('rxdb-premium/plugins/storage-sqlite'))['getRxStorageSQLite'];
  try {
    ({ default: sqlite3InitModule } = await import('@sqlite.org/sqlite-wasm'));
    ({ getRxStorageSQLite } = await import('rxdb-premium/plugins/storage-sqlite'));
  } catch {
    if (!process.env.CI) {
      console.warn('rxdb-premium is not installed (installing it needs the RXDB_PREMIUM token, see docs/CONTRIBUTING.md); skipping @tallyui/storage-sqlite/web tests.');
    }
    return undefined;
  }
  const sqlite3 = await sqlite3InitModule();
  return () => {
    const openDb = async (_name: string) => new sqlite3.oo1.DB(':memory:') as unknown as Oo1Db;
    return getRxStorageSQLite({ sqliteBasics: getSQLiteBasicsOpfsSahPool({ openDb }) });
  };
}

const makeStorage = await loadRealSQLiteStorage();
if (!makeStorage && process.env.CI) {
  it('requires rxdb-premium in CI', () => { throw new Error('rxdb-premium is missing in CI'); });
}

addRxPlugin(RxDBDevModePlugin);

interface HeroDocType {
  id: string;
  name: string;
  power: number;
}

type HeroCollection = RxCollection<HeroDocType>;
type HeroDatabase = RxDatabase<{ heroes: HeroCollection }>;

const heroSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const, maxLength: 100 },
    name: { type: 'string' as const },
    power: { type: 'number' as const },
  },
  required: ['id', 'name', 'power'] as const,
};

(makeStorage ? describe : describe.skip)('sqlite-wasm storage in Node (no OPFS)', () => {
  let db: HeroDatabase;

  beforeEach(async () => {
    const baseStorage = makeStorage!();
    const storage = wrappedValidateAjvStorage({ storage: baseStorage });

    db = await createRxDatabase<{ heroes: HeroCollection }>({
      name: 'sqlite_wasm_node_test_' + Date.now(),
      storage,
      multiInstance: false,
      ignoreDuplicate: true,
    });

    await db.addCollections({ heroes: { schema: heroSchema } });
  });

  afterEach(async () => {
    if (db) await db.close();
  });

  it('inserts a document and queries it back', async () => {
    const doc = await db.heroes.insert({ id: 'hero1', name: 'Superman', power: 100 });
    expect(doc.id).toBe('hero1');

    const found = await db.heroes.findOne('hero1').exec();
    expect(found?.name).toBe('Superman');
    expect(found?.power).toBe(100);
  });

  it('updates a document', async () => {
    const doc = await db.heroes.insert({ id: 'hero1', name: 'Superman', power: 100 });
    await doc.patch({ power: 150 });

    const updated = await db.heroes.findOne('hero1').exec();
    expect(updated?.power).toBe(150);
  });

  it('deletes a document', async () => {
    const doc = await db.heroes.insert({ id: 'hero1', name: 'Superman', power: 100 });
    await doc.remove();

    const found = await db.heroes.findOne('hero1').exec();
    expect(found).toBeNull();
  });

  it('queries by selector', async () => {
    await db.heroes.bulkInsert([
      { id: 'h1', name: 'Batman', power: 80 },
      { id: 'h2', name: 'Superman', power: 100 },
      { id: 'h3', name: 'Flash', power: 90 },
    ]);

    const powerful = await db.heroes.find({ selector: { power: { $gt: 85 } } }).exec();
    expect(powerful.map((d) => d.name).sort()).toEqual(['Flash', 'Superman']);
  });
});

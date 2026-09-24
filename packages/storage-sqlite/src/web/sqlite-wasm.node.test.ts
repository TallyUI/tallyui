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
  const defaultOpenDb = async (_name: string) => new sqlite3.oo1.DB(':memory:') as unknown as Oo1Db;
  return {
    sqlite3,
    makeStorage: (openDb: (name: string) => Promise<Oo1Db> = defaultOpenDb) =>
      getRxStorageSQLite({ sqliteBasics: getSQLiteBasicsOpfsSahPool({ openDb }) }),
  };
}

const sqliteEnv = await loadRealSQLiteStorage();
const makeStorage = sqliteEnv?.makeStorage;
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

async function openHeroDatabase(name: string, openDb?: (name: string) => Promise<Oo1Db>): Promise<HeroDatabase> {
  const storage = wrappedValidateAjvStorage({ storage: makeStorage!(openDb) });
  const db = await createRxDatabase<{ heroes: HeroCollection }>({
    name,
    storage,
    multiInstance: false,
    ignoreDuplicate: true,
  });
  await db.addCollections({ heroes: { schema: heroSchema } });
  return db;
}

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

(makeStorage ? describe : describe.skip)('sqlite-wasm storage in Node: compound index', () => {
  interface OrderDocType {
    id: string;
    customerId: string;
    createdAt: number;
  }
  type OrderCollection = RxCollection<OrderDocType>;

  it('queries through a compound index', async () => {
    const storage = wrappedValidateAjvStorage({ storage: makeStorage!() });
    const db = await createRxDatabase<{ orders: OrderCollection }>({
      name: 'sqlite_wasm_node_test_index_' + Date.now(),
      storage,
      multiInstance: false,
      ignoreDuplicate: true,
    });

    await db.addCollections({
      orders: {
        schema: {
          version: 0,
          primaryKey: 'id',
          type: 'object' as const,
          properties: {
            id: { type: 'string' as const, maxLength: 100 },
            customerId: { type: 'string' as const, maxLength: 100 },
            // Numeric index fields need multipleOf/minimum/maximum (RxDB SC35/SC37).
            createdAt: { type: 'number' as const, multipleOf: 1, minimum: 0, maximum: 1e9 },
          },
          required: ['id', 'customerId', 'createdAt'] as const,
          indexes: [['customerId', 'createdAt']],
        },
      },
    });

    try {
      await db.orders.bulkInsert([
        { id: 'o1', customerId: 'c1', createdAt: 2 },
        { id: 'o2', customerId: 'c1', createdAt: 1 },
        { id: 'o3', customerId: 'c2', createdAt: 1 },
      ]);

      const found = await db.orders
        .find({ selector: { customerId: 'c1' }, sort: [{ customerId: 'asc' }, { createdAt: 'asc' }] })
        .exec();

      expect(found.map((d) => d.id)).toEqual(['o2', 'o1']);
    } finally {
      await db.close();
    }
  });
});

(makeStorage ? describe : describe.skip)('sqlite-wasm storage in Node: file-backed persistence', () => {
  it('keeps documents across a close and reopen of the same database', async () => {
    // sqlite-wasm in Node has no persistent VFS: keep one real `oo1.DB` per
    // name in this map, shared across a close and reopen of the RxDB
    // database, and make the storage's own `close()` a no-op so RxDB never
    // actually destroys it.
    const realDbs = new Map<string, Oo1Db>();
    const openDb = async (name: string): Promise<Oo1Db> => {
      const existing = realDbs.get(name);
      if (existing) return existing;
      const real = new sqliteEnv!.sqlite3.oo1.DB(':memory:') as unknown as Oo1Db;
      const persisting: Oo1Db = { exec: (opts) => real.exec(opts), close: () => {} };
      realDbs.set(name, persisting);
      return persisting;
    };

    const name = 'sqlite_wasm_node_test_reopen_' + Date.now();

    const first = await openHeroDatabase(name, openDb);
    await first.heroes.insert({ id: 'hero1', name: 'Superman', power: 100 });
    await first.close();

    const second = await openHeroDatabase(name, openDb);
    try {
      const found = await second.heroes.findOne('hero1').exec();
      expect(found?.name).toBe('Superman');
    } finally {
      await second.close();
    }
  });

  it('serves two databases with different names on one storage at once', async () => {
    const storage = wrappedValidateAjvStorage({ storage: makeStorage!() });

    const nameA = 'sqlite_wasm_node_test_two_a_' + Date.now();
    const nameB = 'sqlite_wasm_node_test_two_b_' + Date.now();

    const openOn = async (name: string) => {
      const db = await createRxDatabase<{ heroes: HeroCollection }>({
        name,
        storage,
        multiInstance: false,
        ignoreDuplicate: true,
      });
      await db.addCollections({ heroes: { schema: heroSchema } });
      return db;
    };

    const dbA = await openOn(nameA);
    const dbB = await openOn(nameB);

    try {
      await dbA.heroes.insert({ id: 'hero1', name: 'Superman', power: 100 });
      await dbB.heroes.insert({ id: 'hero2', name: 'Batman', power: 80 });

      const foundInA = await dbA.heroes.find().exec();
      const foundInB = await dbB.heroes.find().exec();

      expect(foundInA.map((d) => d.id)).toEqual(['hero1']);
      expect(foundInB.map((d) => d.id)).toEqual(['hero2']);
    } finally {
      await dbA.close();
      await dbB.close();
    }
  });
});

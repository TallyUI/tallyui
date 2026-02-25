/**
 * Integration test: RxDB -> SQLite storage round-trip.
 *
 * Creates a real RxDB database backed by the SQLite storage adapter
 * (using the mock in-memory SQLite) and proves that documents can
 * be inserted, queried, and updated through the full RxDB pipeline.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRxDatabase, addRxPlugin, type RxDatabase, type RxCollection } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { createMockSQLiteDatabase } from './mock-sqlite';
import { getRxStorageSQLite } from './rx-storage-sqlite';

// Enable dev mode for better error messages in tests
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

describe('RxDB + SQLite storage integration', () => {
  let db: HeroDatabase;

  beforeEach(async () => {
    const mockDb = createMockSQLiteDatabase();
    const baseStorage = getRxStorageSQLite(mockDb);
    // Wrap with ajv validator to satisfy dev-mode requirements
    const storage = wrappedValidateAjvStorage({ storage: baseStorage });

    db = await createRxDatabase<{ heroes: HeroCollection }>({
      name: 'integration_test_' + Date.now(),
      storage,
      multiInstance: false,
      ignoreDuplicate: true,
    });

    await db.addCollections({
      heroes: { schema: heroSchema },
    });
  });

  afterEach(async () => {
    if (db) {
      await db.close();
    }
  });

  it('should insert a document and query it back', async () => {
    // Insert
    const doc = await db.heroes.insert({
      id: 'hero1',
      name: 'Superman',
      power: 100,
    });
    expect(doc.id).toBe('hero1');
    expect(doc.name).toBe('Superman');

    // Query back
    const found = await db.heroes.findOne('hero1').exec();
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Superman');
    expect(found!.power).toBe(100);
  });

  it('should insert multiple documents and find them all', async () => {
    await db.heroes.bulkInsert([
      { id: 'h1', name: 'Batman', power: 80 },
      { id: 'h2', name: 'Wonder Woman', power: 95 },
      { id: 'h3', name: 'Flash', power: 90 },
    ]);

    const all = await db.heroes.find().exec();
    expect(all).toHaveLength(3);

    const names = all.map((d) => d.name).sort();
    expect(names).toEqual(['Batman', 'Flash', 'Wonder Woman']);
  });

  it('should update a document', async () => {
    const doc = await db.heroes.insert({
      id: 'hero1',
      name: 'Superman',
      power: 100,
    });

    // Update using RxDB's patch method
    await doc.patch({ power: 150 });

    // Query back the updated version
    const updated = await db.heroes.findOne('hero1').exec();
    expect(updated).not.toBeNull();
    expect(updated!.power).toBe(150);
  });

  it('should delete a document', async () => {
    const doc = await db.heroes.insert({
      id: 'hero1',
      name: 'Superman',
      power: 100,
    });

    await doc.remove();

    const found = await db.heroes.findOne('hero1').exec();
    expect(found).toBeNull();
  });

  it('should support querying by selector', async () => {
    await db.heroes.bulkInsert([
      { id: 'h1', name: 'Batman', power: 80 },
      { id: 'h2', name: 'Superman', power: 100 },
      { id: 'h3', name: 'Flash', power: 90 },
    ]);

    // Query for heroes with power > 85
    // Use in-memory fallback since mock doesn't support json_extract
    const powerful = await db.heroes.find({
      selector: { power: { $gt: 85 } },
    }).exec();

    expect(powerful).toHaveLength(2);
    const names = powerful.map((d) => d.name).sort();
    expect(names).toEqual(['Flash', 'Superman']);
  });

  it('should handle the full create-read-update-delete cycle', async () => {
    // Create
    const doc = await db.heroes.insert({
      id: 'lifecycle',
      name: 'Temp Hero',
      power: 50,
    });
    expect(doc.id).toBe('lifecycle');

    // Read
    let found = await db.heroes.findOne('lifecycle').exec();
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Temp Hero');

    // Update
    await found!.patch({ name: 'Updated Hero', power: 75 });
    found = await db.heroes.findOne('lifecycle').exec();
    expect(found!.name).toBe('Updated Hero');
    expect(found!.power).toBe(75);

    // Delete
    await found!.remove();
    found = await db.heroes.findOne('lifecycle').exec();
    expect(found).toBeNull();
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRxDatabase, addRxPlugin, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { firstValueFrom } from 'rxjs';
import { createRepository } from './create-repository';

addRxPlugin(RxDBDevModePlugin);

const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });

const testSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object' as const,
  properties: {
    id: { type: 'string', maxLength: 100 },
    name: { type: 'string' },
    category: { type: 'string' },
  },
  required: ['id', 'name'] as const,
};

type TestDoc = { id: string; name: string; category?: string };

describe('createRepository', () => {
  let db: RxDatabase;

  beforeEach(async () => {
    db = await createRxDatabase({
      name: `test_repo_${Date.now()}`,
      storage,
      multiInstance: false,
      ignoreDuplicate: true,
    });
    await db.addCollections({ items: { schema: testSchema } });
  });

  afterEach(async () => {
    await db?.close();
  });

  it('creates a document and retrieves it by id', async () => {
    const repo = createRepository<TestDoc>(db.items);
    const doc = await repo.create({ id: '1', name: 'Widget' });
    expect(doc.name).toBe('Widget');

    const found = await firstValueFrom(repo.findById$('1'));
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Widget');
  });

  it('returns null for non-existent id', async () => {
    const repo = createRepository<TestDoc>(db.items);
    const found = await firstValueFrom(repo.findById$('nonexistent'));
    expect(found).toBeNull();
  });

  it('finds all documents', async () => {
    const repo = createRepository<TestDoc>(db.items);
    await repo.create({ id: '1', name: 'A' });
    await repo.create({ id: '2', name: 'B' });

    const all = await firstValueFrom(repo.findAll$());
    expect(all).toHaveLength(2);
  });

  it('finds documents with a mango query', async () => {
    const repo = createRepository<TestDoc>(db.items);
    await repo.create({ id: '1', name: 'A', category: 'x' });
    await repo.create({ id: '2', name: 'B', category: 'y' });

    const filtered = await firstValueFrom(
      repo.findAll$({ selector: { category: 'x' } }),
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('A');
  });

  it('updates a document', async () => {
    const repo = createRepository<TestDoc>(db.items);
    await repo.create({ id: '1', name: 'Old' });
    const updated = await repo.update('1', { name: 'New' });
    expect(updated.name).toBe('New');
  });

  it('removes a document', async () => {
    const repo = createRepository<TestDoc>(db.items);
    await repo.create({ id: '1', name: 'A' });
    await repo.remove('1');

    const all = await firstValueFrom(repo.findAll$());
    expect(all).toHaveLength(0);
  });

  it('bulk creates documents', async () => {
    const repo = createRepository<TestDoc>(db.items);
    const docs = await repo.bulkCreate([
      { id: '1', name: 'A' },
      { id: '2', name: 'B' },
      { id: '3', name: 'C' },
    ]);
    expect(docs).toHaveLength(3);

    const all = await firstValueFrom(repo.findAll$());
    expect(all).toHaveLength(3);
  });

  it('bulk removes documents', async () => {
    const repo = createRepository<TestDoc>(db.items);
    await repo.bulkCreate([
      { id: '1', name: 'A' },
      { id: '2', name: 'B' },
      { id: '3', name: 'C' },
    ]);
    await repo.bulkRemove(['1', '3']);

    const all = await firstValueFrom(repo.findAll$());
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('2');
  });

  it('count$ returns document count', async () => {
    const repo = createRepository<TestDoc>(db.items);
    const count0 = await firstValueFrom(repo.count$());
    expect(count0).toBe(0);

    await repo.create({ id: '1', name: 'A' });
    await repo.create({ id: '2', name: 'B' });

    const count2 = await firstValueFrom(repo.count$());
    expect(count2).toBe(2);
  });

  it('search$ filters by text across specified fields', async () => {
    const repo = createRepository<TestDoc>(db.items);
    await repo.create({ id: '1', name: 'Coffee Beans' });
    await repo.create({ id: '2', name: 'Tea Leaves' });
    await repo.create({ id: '3', name: 'Coffee Grinder' });

    const results = await firstValueFrom(repo.search$('coffee', ['name']));
    expect(results).toHaveLength(2);
  });

  it('search$ handles regex special characters in search term', async () => {
    const repo = createRepository<TestDoc>(db.items);
    await repo.create({ id: '1', name: 'Coffee (Organic)' });
    await repo.create({ id: '2', name: 'Tea' });

    // This should not throw — the parentheses are escaped
    const results = await firstValueFrom(repo.search$('(Organic)', ['name']));
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Coffee (Organic)');
  });

  it('throws when updating a non-existent document', async () => {
    const repo = createRepository<TestDoc>(db.items);
    await expect(repo.update('nonexistent', { name: 'New' })).rejects.toThrow('Document nonexistent not found');
  });

  it('throws when removing a non-existent document', async () => {
    const repo = createRepository<TestDoc>(db.items);
    await expect(repo.remove('nonexistent')).rejects.toThrow('Document nonexistent not found');
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRxDatabase, addRxPlugin, type RxCollection, type RxDatabase, type RxJsonSchema } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';

import { measureCollectionBytes } from './collection-size';

// The database, schema and storage are set up as in reset-collection.test.ts.
addRxPlugin(RxDBDevModePlugin);

const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });

type Doc = { id: string; name: string };
type Collections = { products: RxCollection<Doc> };

const testSchema: RxJsonSchema<Doc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    name: { type: 'string' },
  },
  required: ['id', 'name'],
};

const DOCS: Doc[] = [
  { id: 'a', name: 'Apple' },
  { id: 'b', name: 'Banana' },
  { id: 'c', name: 'Cherry' },
  { id: 'd', name: 'Date' },
  { id: 'e', name: 'café ☕' },
];

const bytesOf = (docs: Doc[]) => docs.reduce((n, d) => n + new TextEncoder().encode(JSON.stringify(d)).byteLength, 0);

describe('measureCollectionBytes', () => {
  let db: RxDatabase<Collections>;

  beforeEach(async () => {
    db = await createRxDatabase<Collections>({ name: `size_${Date.now()}_${Math.random().toString(36).slice(2)}`, storage, multiInstance: false });
    await db.addCollections({ products: { schema: testSchema } });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db?.remove();
  });

  it('S1: counts live docs and sums their UTF-8 JSON bytes', async () => {
    await db.products.bulkInsert(DOCS);
    expect(await measureCollectionBytes(db.products)).toEqual({ docs: 5, bytes: bytesOf(DOCS) });
  });

  it('S2: gives the same result a page of 2 and a page of 1 at a time', async () => {
    await db.products.bulkInsert(DOCS);
    const expected = { docs: 5, bytes: bytesOf(DOCS) };
    expect(await measureCollectionBytes(db.products, { pageSize: 2 })).toEqual(expected);
    expect(await measureCollectionBytes(db.products, { pageSize: 1 })).toEqual(expected);
  });

  it('S3: leaves out a removed doc', async () => {
    await db.products.bulkInsert(DOCS);
    await (await db.products.findOne('c').exec())!.remove();
    expect(await measureCollectionBytes(db.products)).toEqual({
      docs: 4, bytes: bytesOf(DOCS.filter(d => d.id !== 'c')),
    });
  });

  it('S4: gives zero for an empty collection', async () => {
    expect(await measureCollectionBytes(db.products)).toEqual({ docs: 0, bytes: 0 });
  });

  it('S5: counts UTF-8 bytes, not UTF-16 units', async () => {
    const doc = { id: 'a', name: 'é' };
    await db.products.insert(doc);
    expect(await measureCollectionBytes(db.products)).toEqual({ docs: 1, bytes: JSON.stringify(doc).length + 1 });
  });

  it('S6: rejects an aborted signal and a pageSize that is not an integer of at least 1', async () => {
    await db.products.bulkInsert(DOCS);
    const controller = new AbortController();
    controller.abort();
    await expect(measureCollectionBytes(db.products, { signal: controller.signal })).rejects.toThrow();
    await expect(measureCollectionBytes(db.products, { pageSize: 0 })).rejects.toBeInstanceOf(RangeError);
    await expect(measureCollectionBytes(db.products, { pageSize: 1.5 })).rejects.toBeInstanceOf(RangeError);
  });

  it('S7: a signal aborted after the first page rejects before the second', async () => {
    await db.products.bulkInsert(DOCS);
    const controller = new AbortController();
    const instance = db.products.storageInstance;
    const query = instance.query.bind(instance);
    const spy = vi.spyOn(instance, 'query').mockImplementation(async (prepared) => {
      const result = await query(prepared);
      controller.abort();
      return result;
    });
    await expect(measureCollectionBytes(db.products, { pageSize: 2, signal: controller.signal })).rejects.toThrow();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

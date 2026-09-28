import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRxDatabase, addRxPlugin, type RxCollection } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';

import { BACKGROUND_CHUNK_SIZE as C, readFreshInChunks } from './chunks';
import { stockLevelsCollection, type StockLevelRow } from './stock-levels';

addRxPlugin(RxDBDevModePlugin);
addRxPlugin(RxDBLocalDocumentsPlugin);

const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
const N = 2 * C + 7;
const rows = Array.from({ length: N }, (_, i) => ({
  id: `k${String(i).padStart(4, '0')}`, value: i, updatedAt: '2026-01-01T00:00:00.000Z',
}));

describe('readFreshInChunks', () => {
  let db: any;
  let collection: RxCollection<StockLevelRow>;

  beforeEach(async () => {
    db = await createRxDatabase({ name: `chunks_${Math.random().toString(36).slice(2)}`, storage, multiInstance: false });
    await db.addCollections({ stock_levels: stockLevelsCollection });
    collection = db.stock_levels;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db?.close();
  });

  it('reads every document exactly once, in primary-key order, in chunks of at most BACKGROUND_CHUNK_SIZE', async () => {
    await collection.bulkInsert([...rows].reverse());
    const sizes: number[] = [];
    const query = collection.storageInstance.query.bind(collection.storageInstance);
    vi.spyOn(collection.storageInstance, 'query').mockImplementation(async (prepared) => {
      const result = await query(prepared);
      sizes.push(result.documents.length);
      return result;
    });
    const chunks: StockLevelRow[][] = [];
    for await (const chunk of readFreshInChunks(collection)) chunks.push(chunk);
    expect(chunks.flat().map((row) => row.id)).toEqual(rows.map((row) => row.id));
    expect(chunks).toHaveLength(3);
    expect(sizes).toEqual([C, C, 7]);
    expect(sizes.every((size) => size <= C)).toBe(true);
  });

  it('reads an empty collection as no chunks with one storage query', async () => {
    const query = vi.spyOn(collection.storageInstance, 'query');
    const chunks: StockLevelRow[][] = [];
    for await (const chunk of readFreshInChunks(collection)) chunks.push(chunk);
    expect(chunks).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('reads exactly BACKGROUND_CHUNK_SIZE documents as one chunk and yields no empty chunk', async () => {
    await collection.bulkInsert(rows.slice(0, C));
    const chunks: StockLevelRow[][] = [];
    for await (const chunk of readFreshInChunks(collection)) chunks.push(chunk);
    expect(chunks).toEqual([rows.slice(0, C)]);
  });

  it('runs a timer queued during one chunk\'s read before the next chunk is read', async () => {
    await collection.bulkInsert(rows);
    const order: string[] = [];
    const query = collection.storageInstance.query.bind(collection.storageInstance);
    vi.spyOn(collection.storageInstance, 'query').mockImplementation(async (prepared) => {
      order.push('read');
      if (order.length === 1) setTimeout(() => order.push('app'), 0);
      return query(prepared);
    });
    for await (const chunk of readFreshInChunks(collection)) expect(chunk.length).toBeGreaterThan(0);
    expect(order.slice(0, 3)).toEqual(['read', 'app', 'read']);
  });
});

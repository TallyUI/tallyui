// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRxDatabase, type MangoQuery, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { countFresh, readFresh } from './read-fresh';

interface Sale { id: string; status: string; createdAt: string }

const schema = {
  version: 0, primaryKey: 'id', type: 'object',
  properties: { id: { type: 'string', maxLength: 36 }, status: { type: 'string' }, createdAt: { type: 'string' } },
  required: ['id', 'status', 'createdAt'],
} as const;

let db: RxDatabase<{ sales: RxCollection<Sale> }>;
let sales: RxCollection<Sale>;
let dbCount = 0;

beforeEach(async () => {
  db = await createRxDatabase({ name: `readfresh${Date.now()}${dbCount++}`, storage: getRxStorageMemory(), multiInstance: false });
  ({ sales } = await db.addCollections({ sales: { schema } }));
});

afterEach(async () => {
  await db.remove();
});

describe('readFresh and countFresh', () => {
  it('see a sale that the cached query and count miss (RxDB 16.21.1 bug 4)', async () => {
    const pending: MangoQuery<Sale> = { selector: { status: 'pending' }, sort: [{ createdAt: 'asc' }], limit: 10 };
    const first = sales.find(pending).exec();
    const firstCount = sales.count({ selector: { status: 'pending' } }).exec();
    // The repro's timing: the insert starts one microtask after the reads, while they are in flight.
    await Promise.resolve();
    await sales.insert({ id: 'sale-1', status: 'pending', createdAt: '1' });
    await Promise.all([first, firstCount]);
    // The premise: the cached RxQuery and count stay stale. If these fail, RxDB fixed bug 4.
    expect(await sales.find(pending).exec()).toHaveLength(0);
    expect(await sales.count({ selector: { status: 'pending' } }).exec()).toBe(0);
    expect(await readFresh(sales, pending)).toEqual([{ id: 'sale-1', status: 'pending', createdAt: '1' }]);
    expect(await countFresh(sales, { status: 'pending' })).toBe(1);
  });

  it('apply sort and limit, strip RxDB metadata and skip deleted documents', async () => {
    await sales.bulkInsert([
      { id: 'a', status: 'pending', createdAt: '1' },
      { id: 'b', status: 'pending', createdAt: '3' },
      { id: 'c', status: 'pending', createdAt: '2' },
      { id: 'd', status: 'applied', createdAt: '0' },
    ]);
    await (await sales.findOne('a').exec())!.remove();
    const rows = await readFresh(sales, { selector: { status: 'pending' }, sort: [{ createdAt: 'desc' }], limit: 1 });
    expect(rows).toEqual([{ id: 'b', status: 'pending', createdAt: '3' }]);
    expect(await readFresh(sales, { selector: { status: 'pending' }, sort: [{ createdAt: 'asc' }] }))
      .toEqual([{ id: 'c', status: 'pending', createdAt: '2' }, { id: 'b', status: 'pending', createdAt: '3' }]);
    expect(await countFresh(sales, { status: 'pending' })).toBe(2);
  });
});

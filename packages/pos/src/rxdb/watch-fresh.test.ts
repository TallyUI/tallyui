// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type MangoQuery, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { watchFresh } from './watch-fresh';

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
  db = await createRxDatabase({ name: `watchfresh${Date.now()}${dbCount++}`, storage: getRxStorageMemory(), multiInstance: false });
  ({ sales } = await db.addCollections({ sales: { schema } }));
});

afterEach(async () => {
  await db.remove();
});

describe('watchFresh', () => {
  it('emits a write that lands while its first read is in flight, and again on a later change (RxDB 16.21.1 bug 4)', async () => {
    const pending: MangoQuery<Sale> = { selector: { status: 'pending' }, sort: [{ createdAt: 'asc' }] };
    const emissions: Sale[][] = [];
    const subscription = watchFresh(sales, pending).subscribe((rows) => emissions.push(rows));
    // The repro's timing: the insert lands a microtask after subscribe, while the first storage
    // read watchFresh started may still be in flight. A cached `find().$` would miss this write
    // forever (see `read-fresh.test.ts`); watchFresh re-reads on every `collection.$` event.
    await Promise.resolve();
    await sales.insert({ id: 'a', status: 'pending', createdAt: '1' });
    await vi.waitFor(() => expect(emissions.at(-1)).toEqual([{ id: 'a', status: 'pending', createdAt: '1' }]));
    // A later, unrelated-looking change on the collection also triggers a fresh read.
    await sales.insert({ id: 'b', status: 'pending', createdAt: '2' });
    await vi.waitFor(() => expect(emissions.at(-1)).toEqual([
      { id: 'a', status: 'pending', createdAt: '1' }, { id: 'b', status: 'pending', createdAt: '2' },
    ]));
    subscription.unsubscribe();
  });

  it('stops reading once unsubscribed', async () => {
    const querySpy = vi.spyOn(sales.storageInstance, 'query');
    const subscription = watchFresh(sales, { selector: { status: 'pending' } }).subscribe();
    expect(querySpy).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
    await sales.insert({ id: 'z', status: 'pending', createdAt: '9' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(querySpy).toHaveBeenCalledTimes(1);
    querySpy.mockRestore();
  });
});

// The storage-sqlite Playwright test page (real Chromium, ADR-061). Bundled
// by build-and-serve.mjs with the worker into a static page that exercises
// `getRxStorageSQLiteWasm` the way an app would: one RxDB database, backed
// by the dedicated opfs-sahpool worker at `/worker.js`.
import { createRxDatabase, type RxDatabase, type RxCollection } from 'rxdb';
import { getRxStorageSQLiteWasm, isStorageWorkerStartError } from '../../../packages/storage-sqlite/src/web/index';

interface ItemDocType {
  id: string;
  group: string;
  seq: number;
}

type ItemCollection = RxCollection<ItemDocType>;
type ItemDatabase = RxDatabase<{ items: ItemCollection }>;

const schema = {
  version: 0,
  primaryKey: 'id',
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const, maxLength: 100 },
    group: { type: 'string' as const, maxLength: 20 },
    seq: { type: 'number' as const },
  },
  required: ['id', 'group', 'seq'] as const,
  indexes: [['group', 'seq']] as const,
};

let db: ItemDatabase | undefined;

type OpenResult = { ok: true } | { ok: false; isStorageWorkerStartError: boolean; message: string };

async function open(name: string): Promise<OpenResult> {
  try {
    db = await createRxDatabase<{ items: ItemCollection }>({
      name,
      storage: getRxStorageSQLiteWasm({ workerInput: '/worker.js' }),
      multiInstance: false,
    });
    await db.addCollections({ items: { schema } });
    return { ok: true };
  } catch (error) {
    return { ok: false, isStorageWorkerStartError: isStorageWorkerStartError(error), message: String(error) };
  }
}

async function insertMany(total: number): Promise<void> {
  if (!db) throw new Error('not open');
  const docs: ItemDocType[] = Array.from({ length: total }, (_, i) => ({
    id: 'item-' + String(i).padStart(4, '0'),
    group: i % 2 === 0 ? 'even' : 'odd',
    seq: i,
  }));
  await db.items.bulkInsert(docs);
}

async function queryByIndex(group: string): Promise<string[]> {
  if (!db) throw new Error('not open');
  const docs = await db.items.find({ selector: { group }, sort: [{ group: 'asc' }, { seq: 'asc' }] }).exec();
  return docs.map((doc) => doc.id);
}

async function count(): Promise<number> {
  if (!db) throw new Error('not open');
  return db.items.count().exec();
}

async function close(): Promise<void> {
  await db?.close();
  db = undefined;
}

declare global {
  interface Window {
    tally: { open: typeof open; insertMany: typeof insertMany; queryByIndex: typeof queryByIndex; count: typeof count; close: typeof close };
  }
}

window.tally = { open, insertMany, queryByIndex, count, close };

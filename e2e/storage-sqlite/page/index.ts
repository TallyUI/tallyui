// The storage-sqlite Playwright test page (real Chromium, ADR-061). Bundled
// by build-and-serve.mjs into a static page that exercises
// `getRxStorageSQLiteWasm` the way an app would: one RxDB database, backed
// by the dedicated opfs-sahpool worker at `/tallyui-sqlite-worker.js`, built
// by the package's own bin (`tallyui-build-sqlite-worker`).
import { createRxDatabase, type RxDatabase, type RxCollection } from 'rxdb';
import {
  getRxStorageSQLiteWasm,
  isStorageWorkerStartError,
  isStorageUnavailableError,
  isStorageHeldError,
  type RxStorageSQLiteWasm,
} from '../../../packages/storage-sqlite/src/web/index';
// Its own module, so the page bundles without createTallyDatabase's dev-mode setup.
import { connectorCollection } from '../../../packages/database/src/connector-collection';
import { addPosOrderCollection } from '../../../packages/pos/src/pos-order/open';

interface ItemDocType {
  id: string;
  group: string;
  seq: number;
  calculated_price?: { calculated_amount: number | null } | null;
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

/** Version 1 adds one optional property, as backlog 44 did to Medusa's products (a drop-and-resync bump). */
const schemaV1 = {
  ...schema,
  version: 1,
  properties: { ...schema.properties, calculated_price: { type: ['object', 'null'] as const, properties: { calculated_amount: { type: ['number', 'null'] as const } } } },
};

let db: ItemDatabase | undefined;
let storage: RxStorageSQLiteWasm | undefined;

type OpenResult =
  | { ok: true }
  | {
      ok: false;
      isStorageWorkerStartError: boolean;
      isStorageUnavailableError: boolean;
      isStorageHeldError: boolean;
      message: string;
    };

async function open(name: string, version: 0 | 1 = 0): Promise<OpenResult> {
  try {
    db = await createRxDatabase<{ items: ItemCollection }>({
      name,
      // A new storage on every open, as an app builds one after a park.
      storage: (storage = getRxStorageSQLiteWasm({ workerInput: '/tallyui-sqlite-worker.js' })),
      multiInstance: false,
    });
    await db.addCollections({ items: version === 1 ? connectorCollection<ItemDocType>(schemaV1 as any) : { schema } });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      isStorageWorkerStartError: isStorageWorkerStartError(error),
      isStorageUnavailableError: isStorageUnavailableError(error),
      isStorageHeldError: isStorageHeldError(error),
      message: String(error),
    };
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

/** Inserts one version-1 document, with `calculated_price`. */
async function insertPriced(): Promise<void> {
  if (!db) throw new Error('not open');
  await db.items.insert({ id: 'priced', group: 'even', seq: 0, calculated_price: { calculated_amount: 8 } });
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

/**
 * Opens `pos_orders` (schema version 3) in a new database on the worker storage and saves a sale
 * straight after `addPosOrderCollection` resolves, as a till does. Returns each save's outcome.
 */
async function openOrdersAndSave(name: string): Promise<string> {
  const ordersDb = await createRxDatabase({ name, storage: getRxStorageSQLiteWasm({ workerInput: '/tallyui-sqlite-worker.js' }), multiInstance: false });
  try {
    const orders = await addPosOrderCollection(ordersDb);
    const at = new Date().toISOString();
    await orders.insert({
      id: 'order-0001', commandId: 'command-1', createdAt: at, updatedAt: at, currency: 'EUR', pricesIncludeTax: false,
      subtotalMinor: 100, discountMinor: 0, taxMinor: 0, totalMinor: 100, syncStatus: 'pending', customer: null, lines: [],
      payments: [{ id: 'payment-1', method: 'cash', amountMinor: 100 }],
    });
    return 'saved';
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  } finally {
    await ordersDb.close();
  }
}

/** The park order's second step, after close() (ADR-061, amendment 1). */
function terminate(): void {
  storage?.terminate();
}

declare global {
  interface Window {
    tally: {
      open: typeof open;
      insertMany: typeof insertMany;
      insertPriced: typeof insertPriced;
      queryByIndex: typeof queryByIndex;
      count: typeof count;
      close: typeof close;
      terminate: typeof terminate;
      openOrdersAndSave: typeof openOrdersAndSave;
    };
  }
}

window.tally = { open, insertMany, insertPriced, queryByIndex, count, close, terminate, openOrdersAndSave };

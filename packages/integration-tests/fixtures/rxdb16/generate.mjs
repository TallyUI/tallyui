import assert from 'node:assert/strict';
import { rename } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { addRxPlugin, createRxDatabase, getAllCollectionDocuments } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageSQLite } from 'rxdb-premium/plugins/storage-sqlite';
import { addPosOrderCollection, posOrderSchema } from '@tallyui/pos';

addRxPlugin(RxDBMigrationSchemaPlugin);

// Only these additions separate main's v3 schema from the shipped 2.0.0 schema.
const v3 = structuredClone(posOrderSchema);
v3.version = 3;
v3.indexes.push('sessionId');
v3.properties.sessionId.maxLength = 36;
v3.properties.sentVersion = { type: 'integer', minimum: 1, maximum: 3 };
v3.properties.downgradedFrom = { type: 'integer', minimum: 1, maximum: 3 };
const identity = (doc) => doc;

const orders = Array.from({ length: 6 }, (_, index) => {
  const n = index + 1;
  const at = new Date(Date.UTC(2026, 8, 25, 0, 0, n)).toISOString();
  const lineNumber = n === 6 ? 1 : n;
  const amount = 100 * lineNumber;
  return {
    id: `order-${String(n).padStart(4, '0')}`, commandId: `command-${n}`,
    createdAt: at, updatedAt: at, currency: 'EUR', pricesIncludeTax: false,
    subtotalMinor: amount, discountMinor: 0, taxMinor: 0, totalMinor: amount,
    syncStatus: n === 4 ? 'applied' : n === 5 ? 'rejected' : 'pending',
    customer: null,
    lines: n <= 3 || n === 6 ? [{
      id: `line-${lineNumber}`, productId: `p${lineNumber}`,
      name: n === 6 ? 'L'.repeat(300) : `Item ${n}`, sku: `sku-${lineNumber}`,
      quantity: 1, unitPriceMinor: amount, discountMinor: 0, netMinor: amount, taxLines: [],
    }] : [],
    payments: [{ id: `payment-${n}`, method: 'cash', amountMinor: amount }],
    ...(n === 5 ? { error: { code: 'FIXTURE_REJECTED', message: 'Rejected fixture order' } } : {}),
  };
});

const sqliteBoolParams = (params) => params.map((param) => typeof param === 'boolean' ? Number(param) : param);

for (const schema of [posOrderSchema, v3]) {
  const filename = `pos-orders-v${schema.version}.sqlite`;
  const destination = fileURLToPath(new URL(filename, import.meta.url));
  const temporary = `${destination}.tmp`;
  const sqliteBasics = {
    // RxDB supplies a logical name; every store belongs in this fixed-path file.
    open: async () => new DatabaseSync(temporary),
    all: async (db, query) => db.prepare(query.query).all(...sqliteBoolParams(query.params)),
    run: async (db, query) => { db.prepare(query.query).run(...sqliteBoolParams(query.params)); },
    setPragma: async (db, key, value) => { db.exec(`pragma ${key} = ${value};`); },
    close: async (db) => { db.close(); },
    journalMode: 'WAL',
  };
  const db = await createRxDatabase({
    name: 'tally_carry', storage: getRxStorageSQLite({ sqliteBasics }), multiInstance: false,
  });
  let count;
  let version;
  try {
    const collection = schema.version === 2
      ? await addPosOrderCollection(db)
      : (await db.addCollections({ pos_orders: {
        schema, autoMigrate: false, migrationStrategies: { 1: identity, 2: identity, 3: identity },
      } })).pos_orders;
    const inserted = await collection.bulkInsert(structuredClone(orders));
    assert.equal(inserted.error.length, 0, JSON.stringify(inserted.error));
    count = (await collection.find().exec()).length;
    const [metadata] = await getAllCollectionDocuments(db.internalStore);
    version = metadata.data.schema.version;
    assert.equal(count, 6);
    assert.equal(version, schema.version);
  } finally {
    await db.close();
  }
  await rename(temporary, destination);
  console.log(`${filename}: ${count} orders, schema version ${version}`);
}

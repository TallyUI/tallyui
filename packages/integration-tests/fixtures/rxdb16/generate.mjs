import assert from 'node:assert/strict';
import { rename, writeFile } from 'node:fs/promises';
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

const at = (n) => new Date(Date.UTC(2026, 8, 25, 0, 0, n)).toISOString();

const orders = Array.from({ length: 6 }, (_, index) => {
  const n = index + 1;
  const lineNumber = n === 6 ? 1 : n;
  const amount = 100 * lineNumber;
  return {
    id: `order-${String(n).padStart(4, '0')}`, commandId: `command-${n}`,
    createdAt: at(n), updatedAt: at(n), currency: 'EUR', pricesIncludeTax: false,
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
    // The applied order carries what the store answered, as the outbox stored it.
    ...(n === 4 ? {
      serverRefs: { orderId: 'server-order-4', displayId: '#1004', totalMinor: amount },
      warnings: [{ code: 'total_mismatch', expectedMinor: amount, serverMinor: amount + 1 }],
    } : {}),
  };
});

/** A 19% VAT sale of two units at 5.00 with a 1.00 line discount, as main's finalizeOrder writes it for order.create v3. */
function v3Sale(n) {
  const lineId = `line-${n}`;
  return {
    id: `order-${String(n).padStart(4, '0')}`, commandId: `command-${n}`,
    createdAt: at(n), updatedAt: at(n), currency: 'EUR', pricesIncludeTax: false,
    subtotalMinor: 900, discountMinor: 100, taxMinor: 171, totalMinor: 1071, syncStatus: 'pending', customer: null,
    lines: [{
      id: lineId, productId: `p${n}`, variantId: `v${n}`, name: `Item ${n}`, sku: `sku-${n}`, quantity: 2,
      unitPriceMinor: 500, discountMinor: 100, netMinor: 900, taxLines: [{ code: 'VAT', ratePpm: 190000, taxMicros: '171000000' }],
    }],
    payments: [{ id: `payment-${n}`, method: 'cash', amountMinor: 1071, tenderedMinor: 2000, changeMinor: 929 }],
    display: {
      currency: 'EUR', exponent: 2, taxInclusive: false, subtotalMinor: 1000, discountMinor: 100, taxMinor: 171, totalMinor: 1071,
      lines: [{ lineId, amountMinor: 1000, discounts: [{ discountId: `discount-${n}`, label: 'Loyalty', amountMinor: 100 }] }],
      orderDiscountMinor: 0,
    },
    taxByRate: [{ ratePpm: 190000, code: 'VAT', netMinor: 900, amountMinor: 171, grossMinor: 1071 }],
  };
}

/** Pending orders carrying every other field the schema holds; `version` 3 adds the v3-only ones. */
const extraOrders = (version) => [
  // Sent once at version 3, answered as unsupported, and downgraded to version 2 by main's outbox.
  { ...v3Sale(7), ...(version === 3 ? { sentVersion: 2, downgradedFrom: 3 } : {}) },
  {
    ...orders[0], id: 'order-0008', commandId: 'command-8', createdAt: at(8), updatedAt: at(8),
    lines: [{ ...orders[0].lines[0], id: 'line-8', productId: 'p8', name: 'Item 8', sku: 'sku-8' }],
    payments: [{ id: 'payment-8', method: 'external', amountMinor: 100, reference: 'terminal-8' }],
    sessionId: '01a0ef00-0000-7000-8000-000000000008',
    customer: { id: 'customer-8', name: 'Ada Buyer', email: 'ada@example.com' },
  },
  {
    ...orders[1], id: 'order-0009', commandId: 'command-9', createdAt: at(9), updatedAt: at(9),
    lines: [{ ...orders[1].lines[0], id: 'line-9', productId: 'p9', name: 'Item 9', sku: 'sku-9' }],
    payments: [{ id: 'payment-9', method: 'cash', amountMinor: 200 }],
    lateSessionId: '01a0ef00-0000-7000-8000-000000000009',
  },
  { ...v3Sale(10), note: 'Gift wrap', registerId: 'register-1', cashierRef: 'staff-1' },
];

const sqliteBoolParams = (params) => params.map((param) => typeof param === 'boolean' ? Number(param) : param);
const byId = (a, b) => a.id.localeCompare(b.id);

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
  const written = [...orders, ...extraOrders(schema.version)];
  let snapshot;
  let version;
  try {
    const collection = schema.version === 2
      ? await addPosOrderCollection(db)
      : (await db.addCollections({ pos_orders: {
        schema, autoMigrate: false, migrationStrategies: { 1: identity, 2: identity, 3: identity },
      } })).pos_orders;
    const inserted = await collection.bulkInsert(structuredClone(written));
    assert.equal(inserted.error.length, 0, JSON.stringify(inserted.error));
    // Read back what RxDB stored, without its storage metadata: the carry-over test compares every migrated order with it.
    snapshot = (await collection.find().exec())
      .map((doc) => { const { _meta, _rev, _attachments, _deleted, ...order } = doc.toJSON(true); return order; })
      .sort(byId);
    assert.deepStrictEqual(snapshot, structuredClone(written).sort(byId));
    const [metadata] = await getAllCollectionDocuments(db.internalStore);
    version = metadata.data.schema.version;
    assert.equal(snapshot.length, 10);
    assert.equal(version, schema.version);
  } finally {
    await db.close();
  }
  await rename(temporary, destination);
  await writeFile(fileURLToPath(new URL(`pos-orders-v${schema.version}.expected.json`, import.meta.url)),
    `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`${filename}: ${snapshot.length} orders, schema version ${version}`);
}

// Step B of ../rollback/pos-orders-rollback.sqlite: the till is rolled back to RxDB 16.21.1 and @tallyui/pos 2.0.0
// after ../rollback/forward.mjs (step A) opened it at v4. 2.0.0 sees no orders, and one sale is rung. See ../rollback/README.md.
import assert from 'node:assert/strict';
import { copyFile, readFile, rename, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageSQLite } from 'rxdb-premium/plugins/storage-sqlite';
import { addPosOrderCollection } from '@tallyui/pos';

addRxPlugin(RxDBMigrationSchemaPlugin);

const destination = fileURLToPath(new URL('../rollback/pos-orders-rollback.sqlite', import.meta.url));
const snapshot = fileURLToPath(new URL('../rollback/pos-orders-rollback.expected.json', import.meta.url));
const temporary = `${destination}.tmp`;
await copyFile(destination, temporary);

/** A pending sale rung on the rolled-back 2.0.0 build, at its v2 schema. */
const order = {
  id: 'order-0102', commandId: 'command-102', createdAt: '2026-09-26T00:01:02.000Z', updatedAt: '2026-09-26T00:01:02.000Z',
  currency: 'EUR', pricesIncludeTax: false, subtotalMinor: 1020, discountMinor: 0, taxMinor: 0, totalMinor: 1020,
  syncStatus: 'pending', customer: null,
  lines: [{ id: 'line-102', productId: 'p102', name: 'Item 102', sku: 'sku-102', quantity: 1, unitPriceMinor: 1020,
    discountMinor: 0, netMinor: 1020, taxLines: [] }],
  payments: [{ id: 'payment-102', method: 'cash', amountMinor: 1020 }],
};

const sqliteBoolParams = (params) => params.map((param) => typeof param === 'boolean' ? Number(param) : param);
const sqliteBasics = {
  // RxDB supplies a logical name; every store belongs in this fixed-path file.
  open: async () => new DatabaseSync(temporary),
  all: async (db, query) => db.prepare(query.query).all(...sqliteBoolParams(query.params)),
  run: async (db, query) => { db.prepare(query.query).run(...sqliteBoolParams(query.params)); },
  setPragma: async (db, key, value) => { db.exec(`pragma ${key} = ${value};`); },
  close: async (db) => { db.close(); },
  journalMode: 'WAL',
};
const db = await createRxDatabase({ name: 'tally_carry', storage: getRxStorageSQLite({ sqliteBasics }), multiInstance: false });
let stored;
try {
  // 2.0.0 opens without error and shows none of the orders 17.5.0 moved to v4: RxDB looks only for older versions.
  const orders = await addPosOrderCollection(db);
  assert.equal(orders.schema.version, 2);
  assert.equal((await orders.find().exec()).length, 0);
  const { _meta, _rev, _attachments, _deleted, ...inserted } = (await orders.insert(structuredClone(order))).toJSON(true);
  assert.deepStrictEqual(inserted, order);
  stored = inserted;
} finally {
  await db.close();
}
await rename(temporary, destination);
const expected = JSON.parse(await readFile(snapshot, 'utf8'));
assert.deepStrictEqual(expected.map((entry) => entry.id), ['order-0101']);
await writeFile(snapshot, `${JSON.stringify([...expected, stored], null, 2)}\n`);
console.log('pos-orders-rollback.sqlite: 2.0.0 saw 0 orders; order-0102 rung at v2');

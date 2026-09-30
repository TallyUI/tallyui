// Step A of pos-orders-rollback.sqlite: this branch's RxDB 17.5.0 and built @tallyui/pos open the RxDB 16.21.1 v3
// fixture (migrating it to v4) and ring one more pending sale. Step B is ../rxdb16/rollback.mjs. See README.md.
import assert from 'node:assert/strict';
import { copyFile, rename, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { createRxDatabase } from 'rxdb';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { addPosOrderCollection } from '@tallyui/pos';
import { getRxStorageSQLite } from '@tallyui/storage-sqlite';

const destination = fileURLToPath(new URL('pos-orders-rollback.sqlite', import.meta.url));
const temporary = `${destination}.tmp`;
await copyFile(fileURLToPath(new URL('../rxdb16/pos-orders-v3.sqlite', import.meta.url)), temporary);

/** A pending sale rung on 17.5.0 at v4, which the store has failed with a 503 for a while. */
const order = {
  id: 'order-0101', commandId: 'command-101', createdAt: '2026-09-26T00:01:01.000Z', updatedAt: '2026-09-26T00:01:01.000Z',
  currency: 'EUR', pricesIncludeTax: false, subtotalMinor: 1010, discountMinor: 0, taxMinor: 0, totalMinor: 1010,
  syncStatus: 'pending', customer: null,
  lines: [{ id: 'line-101', productId: 'p101', name: 'Item 101', sku: 'sku-101', quantity: 1, unitPriceMinor: 1010,
    discountMinor: 0, netMinor: 1010, taxLines: [] }],
  payments: [{ id: 'payment-101', method: 'external', amountMinor: 1010 }],
  localWarnings: [{ code: 'payment_reference_dropped', paymentId: 'payment-101' }],
  serverFailures: { since: Date.UTC(2026, 8, 26, 0, 1, 30), reason: 'status_503', isolated: false },
};

// The same synchronous handle `@tallyui/storage-sqlite` gets from expo-sqlite, over node:sqlite.
const raw = new DatabaseSync(temporary);
const database = {
  execSync: (sql) => raw.exec(sql),
  getAllSync: (sql, params = []) => raw.prepare(sql).all(...params),
  runSync: (sql, params = []) => {
    const result = raw.prepare(sql).run(...params);
    return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
  },
};
let stored;
try {
  const db = await createRxDatabase({ name: 'tally_carry',
    storage: wrappedValidateAjvStorage({ storage: getRxStorageSQLite(database) }), multiInstance: false });
  try {
    const orders = await addPosOrderCollection(db);
    assert.equal(orders.schema.version, 4);
    assert.equal((await orders.find().exec()).length, 10);
    const { _meta, _rev, _attachments, _deleted, ...inserted } = (await orders.insert(structuredClone(order))).toJSON(true);
    assert.deepStrictEqual(inserted, order);
    stored = inserted;
  } finally {
    await db.close();
  }
} finally {
  raw.close();
}
await rename(temporary, destination);
await writeFile(fileURLToPath(new URL('pos-orders-rollback.expected.json', import.meta.url)), `${JSON.stringify([stored], null, 2)}\n`);
console.log('pos-orders-rollback.sqlite: the v3 fixture at v4, plus order-0101');

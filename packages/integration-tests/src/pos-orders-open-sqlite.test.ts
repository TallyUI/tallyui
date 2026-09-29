// @vitest-environment node
// `addPosOrderCollection` on SQLite, the production storage, where a close can interrupt a
// migration that RxDB's own open path leaves running (ADR-032 amendment 2), from version 0, 1 and 2.
import { describe, expect, it } from 'vitest';
import { createRxDatabase, normalizeMangoQuery, prepareQuery } from 'rxdb';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { addPosOrderCollectionTests } from '@tallyui/pos/pos-order/open.test-helper';
import { createOrderBuilder } from '@tallyui/pos/order/order-builder';
import { finalizeOrder } from '@tallyui/pos/pos-order/finalize';
import { addPosOrderCollection } from '@tallyui/pos/pos-order/open';
import { uuidv7 } from '@tallyui/pos/pos-order/uuidv7';
import { loadSQLiteStorage, openNodeSQLite } from '@tallyui/storage-sqlite/node-sqlite.test-helper';

const getRxStorageSQLite = await loadSQLiteStorage();
if (!getRxStorageSQLite && process.env.CI) {
  it('requires rxdb-premium in CI', () => { throw new Error('rxdb-premium is missing in CI'); });
}

// One SQLite handle per test: it serves one database name.
(getRxStorageSQLite ? describe : describe.skip)('addPosOrderCollection on SQLite storage', () =>
  addPosOrderCollectionTests(() => getRxStorageSQLite!(openNodeSQLite().database), { sqlite: true }));

// The same tests from version 1 (a version-1 order carries its sessionId) to version 3.
(getRxStorageSQLite ? describe : describe.skip)('addPosOrderCollection on SQLite storage from version 1', () =>
  addPosOrderCollectionTests(() => getRxStorageSQLite!(openNodeSQLite().database), { sqlite: true, from: 1 }));

(getRxStorageSQLite ? describe : describe.skip)('addPosOrderCollection on SQLite storage from version 2', () =>
  addPosOrderCollectionTests(() => getRxStorageSQLite!(openNodeSQLite().database), { sqlite: true, from: 2 }));

(getRxStorageSQLite ? it : it.skip)('finds orders by sessionId through its index, and never returns an unstamped order', async () => {
  const db = await createRxDatabase({ name: `posorder${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageSQLite!(openNodeSQLite().database) }), multiInstance: false });
  try {
    const orders = await addPosOrderCollection(db);
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 100, currency: 'EUR' } });
    builder.addPayment({ method: 'cash', amountMinor: 100 });
    const order = finalizeOrder(builder.getSnapshot());
    const inserted = await orders.bulkInsert([
      { ...order, id: 'stamped-a', sessionId: 'a' }, { ...order, id: 'stamped-b', sessionId: 'b' },
      { ...order, id: 'unstamped' }, { ...order, id: 'late', lateSessionId: 'a' },
    ]);
    expect(inserted.error).toEqual([]);
    const queries: Array<[string | { $in: string[] }, string[], string[]]> = [
      ['a', ['stamped-a'], ['_deleted', 'sessionId', 'id']],
      // RxDB 17's planner uses a field's index for `$in` too (rxdb#8631).
      [{ $in: ['a', 'b'] }, ['stamped-a', 'stamped-b'], ['_deleted', 'sessionId', 'id']],
    ];
    for (const [sessionId, ids, index] of queries) {
      const query = orders.find({ selector: { sessionId } });
      expect((await query.exec()).map((doc) => doc.id).sort()).toEqual(ids);
      const schema = orders.schema.jsonSchema;
      expect(prepareQuery(schema, normalizeMangoQuery(schema, query.getPreparedQuery().query)).queryPlan.index).toEqual(index);
    }
  } finally {
    await db.remove();
  }
});

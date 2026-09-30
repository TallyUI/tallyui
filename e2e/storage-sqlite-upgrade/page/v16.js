// The old till (#242): @tallyui 2.0.0's main thread on RxDB 16.21.1, built from the 2.0.0 tree
// (E2E_V16_TREE, reached through the `tallyui-v16` alias), with the 2.0.0 storage worker at
// /v16/tallyui-sqlite-worker.js on the SAH-pool OPFS storage. It writes what a 2.0.0 till holds:
// pos_orders through 2.0.0's own opener, and the register state 2.0.0 keeps in RxDB (the register
// local document, an open session and a cash movement). Plain JS, so the 2.0.0 sources need no
// type setup in this tree.
import { createRxDatabase, RXDB_VERSION } from 'rxdb';
import { getRxStorageSQLiteWasm } from 'tallyui-v16/storage-sqlite/src/web/index';
import { addPosOrderCollection } from 'tallyui-v16/pos/src/pos-order/open';
import { readFresh } from 'tallyui-v16/core/src/rxdb/read-fresh';
import { cashMovementSchema, closureSchema, registerSessionCollection } from 'tallyui-v16/pos/src/register/schemas';
import { openSession, recordMovement } from 'tallyui-v16/pos/src/register/session-store';
import { bindRegister, ensureRegister, nextSaleCounter, readRegister } from 'tallyui-v16/pos/src/register/register-document';

const WORKER = '/v16/tallyui-sqlite-worker.js';
const STORE_KEY = 'store-1';
const byId = { sort: [{ id: 'asc' }] };

/** Everything the till holds, as plain data without RxDB's metadata (the same `readFresh` main uses). */
async function snapshot(db) {
  return {
    orders: await readFresh(db.pos_orders, { selector: {}, ...byId }),
    register: await readRegister(db.register_sessions),
    sessions: await readFresh(db.register_sessions, { selector: {}, ...byId }),
    movements: await readFresh(db.cash_movements, { selector: {}, ...byId }),
    closures: await readFresh(db.closures, { selector: {}, ...byId }),
  };
}

/** Writes `orders` (the fixture set) and the register state into database `name`, reads it all back, and closes. */
async function write(name, orders) {
  const storage = getRxStorageSQLiteWasm({ workerInput: WORKER });
  const db = await createRxDatabase({ name, storage, multiInstance: false });
  try {
    const collection = await addPosOrderCollection(db);
    const inserted = await collection.bulkInsert(structuredClone(orders));
    if (inserted.error.length > 0) throw new Error(`bulkInsert refused: ${JSON.stringify(inserted.error)}`);

    const { register_sessions: sessions, cash_movements: movements, closures } = await db.addCollections({
      register_sessions: registerSessionCollection(),
      cash_movements: { schema: cashMovementSchema },
      closures: { schema: closureSchema },
    });
    await ensureRegister(sessions, 'web');
    await bindRegister(sessions, STORE_KEY, { id: 'register-1', name: 'Till 1' });
    await nextSaleCounter(sessions, STORE_KEY);
    const session = await openSession(sessions, {
      registerId: 'register-1', expectedFloatMinor: 10000, countedFloatMinor: 10000, openedBy: 'staff-1',
      businessDay: { year: 2026, month: 9, day: 25 }, storeKey: STORE_KEY,
    });
    await recordMovement(sessions, movements, closures, {
      sessionId: session.id, type: 'paid_in', amountMinor: 500, reason: 'Float top-up', actor: 'staff-1',
    });
    return { rxdbVersion: RXDB_VERSION, ...(await snapshot(db)) };
  } finally {
    await db.close();
  }
}

window.tally = { write };

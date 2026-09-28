// @vitest-environment node
// Ported from WCPOS `next` `3b5331b5c` `session-store.test.ts` (ADR-032 amendment 1). Money is
// minor units at exponent 2: WCPOS's '100' becomes 10000. Actors are string ids: 7 becomes '7'.
//
// Dropped:
//   - 're-queues a refused movement so the outbox will send it again': `retryMovement` is
//     outbox-only and moves to registers job c.
// Changed: the outbox's `sync_status` assertions are gone (no outbox on these collections), and
// so is the gate's refusal of a `sync_status: 'failed'` session, which only the outbox sets.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { createOrderBuilder } from '../order/order-builder';
import { toOrderCreateEnvelope } from '../pos-order/command';
import { finalizeOrder } from '../pos-order/finalize';
import type { PosOrder } from '../pos-order/types';
import { ensureRegister } from './register-document';
import { cashMovementSchema, closureSchema, registerSessionCollection } from './schemas';
import { serverClose as closeOnServer } from './server-close.test-helper';
import {
  backToSelling,
  closeSession,
  openSession,
  recordMovement,
  RegisterMovementAmountError,
  RegisterMovementReasonError,
  RegisterMovementStrandedError,
  RegisterSessionClosedError,
  RegisterSessionRequiredError,
  requireOpenSession,
  stampSession,
  startCounting,
  voidMovement,
  writeClosure,
  type CashMovementCollection,
  type ClosureCollection,
  type RegisterSessionCollection,
} from './session-store';

let db: RxDatabase<{
  register_sessions: RegisterSessionCollection; cash_movements: CashMovementCollection; closures: ClosureCollection;
}>;
async function openDatabase(name: string) {
  db = await createRxDatabase({
    name,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    multiInstance: false,
  });
  await db.addCollections({
    register_sessions: registerSessionCollection(),
    cash_movements: { schema: cashMovementSchema },
    closures: { schema: closureSchema },
  });
}
beforeEach(() => openDatabase(`session${Math.random().toString(36).slice(2)}`));
afterEach(async () => {
  await db.remove();
});
const input = {
  registerId: 'register',
  expectedFloatMinor: 10000,
  countedFloatMinor: 10000,
  openedBy: '7',
  businessDay: { year: 2026, month: 9, day: 16 },
};
it('opens pending and retains the pending transition through each local state', async () => {
  const doc = await openSession(db.register_sessions, input);
  expect(doc.toJSON()).toMatchObject({ status: 'open', counted_float_minor: 10000, opening_variance_minor: 0 });
  await startCounting(db.register_sessions, doc.id);
  expect(doc.getLatest().toJSON()).toMatchObject({ status: 'counting', pending_status: 'counting' });
  await backToSelling(db.register_sessions, doc.id);
  expect(doc.getLatest().toJSON()).toMatchObject({ status: 'open', pending_status: 'open' });
  await startCounting(db.register_sessions, doc.id);
  await closeSession(db.register_sessions, doc.id, { counted: { cash: 10500 } });
  expect(doc.getLatest().toJSON()).toMatchObject({
    status: 'closed',
    pending_status: 'closed',
    counted: { cash: 10500 },
  });
});
it('recordMovement refuses a reason the server would refuse, before writing', async () => {
  const session = await openSession(db.register_sessions, input);
  const reads = vi.spyOn(db.register_sessions.storageInstance, 'findDocumentsById');
  for (const reason of ['', '   ', 'x'.repeat(501)]) {
    await expect(recordMovement(db.register_sessions, db.cash_movements, db.closures, {
      sessionId: session.id, type: 'paid_out', amountMinor: 700, reason, actor: '7',
    })).rejects.toThrow(RegisterMovementReasonError);
    expect(await db.cash_movements.find().exec()).toHaveLength(0);
  }
  expect(reads).not.toHaveBeenCalled();
  reads.mockRestore();
  for (const reason of [' ok ', 'x'.repeat(500)]) {
    const row = await recordMovement(db.register_sessions, db.cash_movements, db.closures, {
      sessionId: session.id, type: 'paid_out', amountMinor: 700, reason, actor: '7',
    });
    expect(row.reason).toBe(reason);
  }
  expect(await db.cash_movements.find().exec()).toHaveLength(2);
});

it('void inserts a write-once reversal and marks its target', async () => {
  const session = await openSession(db.register_sessions, input);
  const row = await recordMovement(db.register_sessions, db.cash_movements, db.closures, {
    sessionId: session.id,
    type: 'paid_out',
    amountMinor: 700,
    reason: 'Milk',
    actor: '7',
  });
  const [reversal, concurrent] = await Promise.all([
    voidMovement(db.register_sessions, db.cash_movements, row.id, '7'),
    voidMovement(db.register_sessions, db.cash_movements, row.id, '7'),
  ]);
  expect(concurrent.id).toBe(reversal.id);
  const repeated = await voidMovement(db.register_sessions, db.cash_movements, row.id, '7');
  expect(reversal.toJSON()).toMatchObject({ type: 'void', voids: row.id, amountMinor: 700 });
  expect(repeated.id).toBe(reversal.id);
  expect(await db.cash_movements.count().exec()).toBe(2);
  expect(row.getLatest().voided_by).toBe(reversal.id);
});

it('gates counting and missing sessions, and expires the expected snapshot before money actions', async () => {
  expect(await requireOpenSession(undefined, null, false)).toBeNull();
  await expect(requireOpenSession(db.register_sessions, 'register', true)).rejects.toMatchObject({
    name: 'RegisterSessionRequiredError',
  });
  const row = await openSession(db.register_sessions, input);
  await row.incrementalPatch({ server_expected: { cash: 10000 }, server_sales_count: 2 });
  expect(await requireOpenSession(db.register_sessions, 'register', true)).toBe(row.id);
  expect(row.getLatest().server_expected).toBeNull();
  await startCounting(db.register_sessions, row.id);
  await expect(requireOpenSession(db.register_sessions, 'register', true)).rejects.toMatchObject({
    name: 'RegisterSessionRequiredError',
  });
  // TallyUI: a closed session takes no more sales either.
  await closeSession(db.register_sessions, row.id, { counted: { cash: 10000 } });
  await expect(requireOpenSession(db.register_sessions, 'register', true)).rejects.toMatchObject({
    name: 'RegisterSessionRequiredError',
  });
});

// Revert: remove business_day from openSession's inserted row.
it('stamps the supplied store day rather than the device UTC day', async () => {
  const row = await openSession(db.register_sessions, input);
  expect(row.toJSON()).toMatchObject({ business_day: '2026-09-16' });
});

// Revert: close a legacy overnight session without stamping its opening store day.
it('derives the opening business day when closing a legacy session', async () => {
  const doc = await openSession(db.register_sessions, input);
  await doc.incrementalModify((value) => {
    delete value.business_day;
    return { ...value, opened_at_gmt: '2026-09-17T02:00:00Z' };
  });
  await closeSession(db.register_sessions, doc.id, {
    counted: { cash: 10000 },
    ...{ timezone: 'America/Los_Angeles' },
  });
  expect(doc.getLatest().business_day).toBe('2026-09-16');
});

// TallyUI: WCPOS's `date-fns` became `Intl`; east of UTC, 23:30 UTC is already the next day.
it('derives the next local day east of UTC when closing a legacy session', async () => {
  const doc = await openSession(db.register_sessions, input);
  await doc.incrementalModify((value) => {
    delete value.business_day;
    return { ...value, opened_at_gmt: '2026-09-16T23:30:00Z' };
  });
  await closeSession(db.register_sessions, doc.id, { counted: { cash: 10000 }, timezone: 'Asia/Tokyo' });
  expect(doc.getLatest().business_day).toBe('2026-09-17');
});

// TallyUI (#123 review, F1): a closed session is final. Revert: drop the guard in transition().
it('refuses to reopen or recount a closed session, and a repeat close changes nothing', async () => {
  const doc = await openSession(db.register_sessions, input);
  await expect(backToSelling(db.register_sessions, doc.id)).rejects.toThrow('invalid_session_transition:open->open');
  const closed = await closeSession(db.register_sessions, doc.id, { counted: { cash: 10500 }, closedBy: '7' });
  await expect(backToSelling(db.register_sessions, doc.id)).rejects.toBeInstanceOf(RegisterSessionClosedError);
  await expect(startCounting(db.register_sessions, doc.id)).rejects.toBeInstanceOf(RegisterSessionClosedError);
  await new Promise((resolve) => setTimeout(resolve, 5)); // a later close would stamp a later time
  const again = await closeSession(db.register_sessions, doc.id, { counted: { cash: 1 }, closedBy: '8' });
  expect(again.toJSON()).toEqual(closed.toJSON());
  expect(doc.getLatest().toJSON()).toMatchObject({
    counted: { cash: 10500 }, closed_by: '7', closed_at_gmt: closed.closed_at_gmt,
  });
});

// TallyUI (approved-by): the manager's approval is written in the closing write and reaches the
// Z. Revert: drop `approved_by` from closeSession's write.
it('writes approvedBy in the close, and the Z carries it as breakdowns.approved_by', async () => {
  await ensureRegister(db.register_sessions, 'web');
  const doc = await openSession(db.register_sessions, input);
  const closed = await closeSession(db.register_sessions, doc.id, { counted: { cash: 9000 }, closedBy: '7', approvedBy: 'mgr-1' });
  expect(closed.approved_by).toBe('mgr-1');
  const closure = await writeClosure({
    closures: db.closures, register: db.register_sessions, storeKey: 'store', session: closed, counted: 9000,
    otherTenders: {}, movements: [], orders: [], softwareVersion: '1.0.0',
  });
  expect(closure.breakdowns.approved_by).toBe('mgr-1');
});

// Without an approver the session's `approved_by` stays unset (the schema has no default), and
// the Z's is null.
it('leaves approved_by unset on a close without approvedBy', async () => {
  await ensureRegister(db.register_sessions, 'web');
  const doc = await openSession(db.register_sessions, input);
  const closed = await closeSession(db.register_sessions, doc.id, { counted: { cash: 10000 }, closedBy: '7' });
  expect(closed.toJSON().approved_by).toBeUndefined();
  const closure = await writeClosure({
    closures: db.closures, register: db.register_sessions, storeKey: 'store', session: closed, counted: 10000,
    otherTenders: {}, movements: [], orders: [], softwareVersion: '1.0.0',
  });
  expect(closure.breakdowns.approved_by).toBeNull();
});

// A repeat close keeps the first close's approver, as it keeps its count, time and actor.
// Revert: let a repeat close patch `approved_by`.
it('never overwrites approved_by on a repeat close', async () => {
  const doc = await openSession(db.register_sessions, input);
  await closeSession(db.register_sessions, doc.id, { counted: { cash: 9000 }, closedBy: '7', approvedBy: 'mgr-1' });
  await closeSession(db.register_sessions, doc.id, { counted: { cash: 9000 }, closedBy: '8', approvedBy: 'mgr-2' });
  expect(doc.getLatest().approved_by).toBe('mgr-1');
  await closeSession(db.register_sessions, doc.id, { counted: { cash: 9000 }, closedBy: '8' });
  expect((await db.register_sessions.findOne(doc.id).exec())?.approved_by).toBe('mgr-1');
});

// #168 review: two concurrent closes with different approvers. `transition`'s guard runs again
// inside `incrementalModify`, so exactly one approver is stored and both calls return it.
it('stores one approver when two closes race, and both return it', async () => {
  const doc = await openSession(db.register_sessions, input);
  await startCounting(db.register_sessions, doc.id);
  const results = await Promise.all([
    closeSession(db.register_sessions, doc.id, { counted: { cash: 9000 }, approvedBy: 'mgr-1' }),
    closeSession(db.register_sessions, doc.id, { counted: { cash: 9000 }, approvedBy: 'mgr-2' }),
  ]);
  const stored = (await db.register_sessions.findOne(doc.id).exec())?.approved_by;
  expect(['mgr-1', 'mgr-2']).toContain(stored);
  expect(results.map((row) => row.approved_by)).toEqual([stored, stored]);
});

it('recordMovement refuses an amount the server would refuse, before writing', async () => {
  const session = await openSession(db.register_sessions, input);
  for (const [type, amountMinor] of [
    ['paid_in', 0], ['paid_out', -300], ['paid_in', 1.5], ['no_sale', 100],
  ] as const) {
    await expect(recordMovement(db.register_sessions, db.cash_movements, db.closures, {
      sessionId: session.id, type, amountMinor, reason: 'Test', actor: '7',
    })).rejects.toBeInstanceOf(RegisterMovementAmountError);
  }
  expect(await db.cash_movements.count().exec()).toBe(0);
  for (const [type, amountMinor] of [
    ['paid_in', 700], ['paid_out', 300], ['no_sale', 0],
  ] as const) {
    const row = await recordMovement(db.register_sessions, db.cash_movements, db.closures, {
      sessionId: session.id, type, amountMinor, reason: 'Test', actor: '7',
    });
    expect(row.toJSON()).toMatchObject({ type, amountMinor });
  }
  expect(await db.cash_movements.count().exec()).toBe(3);
});

// TallyUI (#123 review, F2): movements check their session. Revert: drop the session check.
it('refuses movements on a closed or missing session, and voids on a closed one', async () => {
  const session = await openSession(db.register_sessions, input);
  const move = (sessionId: string) =>
    recordMovement(db.register_sessions, db.cash_movements, db.closures, {
      sessionId, type: 'paid_out', amountMinor: 700, reason: 'Milk', actor: '7',
    });
  const row = await move(session.id);
  await expect(move('missing')).rejects.toBeInstanceOf(RegisterSessionRequiredError);
  await startCounting(db.register_sessions, session.id);
  await move(session.id); // counting still takes movements
  await closeSession(db.register_sessions, session.id, { counted: { cash: 8600 } });
  await expect(move(session.id)).rejects.toBeInstanceOf(RegisterSessionClosedError);
  await expect(voidMovement(db.register_sessions, db.cash_movements, row.id, '7')).rejects.toBeInstanceOf(
    RegisterSessionClosedError,
  );
  expect(await db.cash_movements.count().exec()).toBe(2);
  expect(row.getLatest().voided_by).toBeFalsy();
});

// TallyUI (registers job c review, F1): stampSession is the call that sets sessionId. Revert:
// make stampSession accept a closed session.
it('stampSession stamps an unstamped order on an open or counting session, refuses a closed, missing, or already-differently-stamped one, and never touches the envelope', async () => {
  const session = await openSession(db.register_sessions, input);
  const build = () => {
    let n = 0;
    const newId = () => `00000000-0000-7000-8000-${String(++n).padStart(12, '0')}`;
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 500, currency: 'EUR' } });
    builder.addPayment({ method: 'cash', amountMinor: 500 });
    return finalizeOrder(builder.getSnapshot(), { now: new Date('2026-09-23T12:00:00.000Z'), newId });
  };
  const stamped = await stampSession(build(), session.id, db.register_sessions);
  expect(stamped.sessionId).toBe(session.id);
  expect(JSON.stringify(toOrderCreateEnvelope(stamped, 'device-1')))
    .toBe(JSON.stringify(toOrderCreateEnvelope(build(), 'device-1')));
  // Stamping the same id again is fine; a different one is refused as a re-stamp.
  expect((await stampSession(stamped, session.id, db.register_sessions)).sessionId).toBe(session.id);
  await expect(stampSession(stamped, 'other-session', db.register_sessions)).rejects.toThrow('session_already_stamped');

  await startCounting(db.register_sessions, session.id);
  expect((await stampSession(build(), session.id, db.register_sessions)).sessionId).toBe(session.id);

  await expect(stampSession(build(), 'missing', db.register_sessions)).rejects.toBeInstanceOf(RegisterSessionRequiredError);

  await closeSession(db.register_sessions, session.id, { counted: { cash: 500 } });
  await expect(stampSession(build(), session.id, db.register_sessions)).rejects.toBeInstanceOf(RegisterSessionClosedError);
});

// ADR-032 and docs/rxdb/query-cache-reads.md (the 2026-09-28 audit's MONEY rows): the live-session
// checks read storage by primary key. A status write that skips the cached `findOne(id)`, as a
// server sync (registers c2) would, can land while a cold read of the session is in flight, and
// RxDB 16.21.1's query cache then keeps the session as it was before the close. A restart leaves
// no session in RxDB's document cache, so the next read of it is cold.
async function restart() {
  const { name } = db;
  await db.close();
  await openDatabase(name);
}
const serverClose = (id: string) => closeOnServer(db.register_sessions, id);
/** Lands `write` during the next storage read by id: after storage answers, before the reader sees it. */
function duringNextReadById(write: () => Promise<void>) {
  const storage = db.register_sessions.storageInstance;
  const read = storage.findDocumentsById.bind(storage);
  let landed = false;
  storage.findDocumentsById = async (ids, withDeleted) => {
    storage.findDocumentsById = read;
    const found = await read(ids, withDeleted);
    await write();
    landed = true;
    return found;
  };
  return () => landed;
}
const paidOut = (sessionId: string) =>
  recordMovement(db.register_sessions, db.cash_movements, db.closures, {
    sessionId, type: 'paid_out', amountMinor: 700, reason: 'Milk', actor: '7',
  });

// Revert: decide requireLiveSession on `sessions.findOne(id).exec()`.
it('refuses the next stamp after a close that skipped the cached read raced the first stamp', async () => {
  const { id } = await openSession(db.register_sessions, input);
  await restart();
  const raced = duringNextReadById(() => serverClose(id));
  await stampSession({ id: 'o1' } as PosOrder, id, db.register_sessions); // its read predates the close
  expect(raced()).toBe(true);
  await expect(stampSession({ id: 'o2' } as PosOrder, id, db.register_sessions)).rejects.toBeInstanceOf(
    RegisterSessionClosedError,
  );
});

// Revert: decide requireLiveSession and the re-read after the insert on `sessions.findOne(id).exec()`.
it('never records a movement as live on a session closed by a write that skipped the cached read', async () => {
  const { id } = await openSession(db.register_sessions, input);
  await restart();
  const raced = duringNextReadById(() => serverClose(id));
  // The check's read predates the close, the re-read sees it, and no closure row exists yet.
  await expect(paidOut(id)).rejects.toBeInstanceOf(RegisterMovementStrandedError);
  expect(raced()).toBe(true);
  await expect(paidOut(id)).rejects.toBeInstanceOf(RegisterSessionClosedError);
  expect(await db.cash_movements.count().exec()).toBe(1);
});

// Revert: decide the re-read after the insert on `sessions.findOne(id).exec()`.
it('keeps a movement stranded when that close lands during its insert, inside another cold findOne', async () => {
  const { id } = await openSession(db.register_sessions, input);
  await restart();
  let raced = () => false;
  const insert = db.cash_movements.insert.bind(db.cash_movements);
  db.cash_movements.insert = (async (doc: Parameters<typeof insert>[0]) => {
    const row = await insert(doc);
    db.cash_movements.insert = insert;
    raced = duringNextReadById(() => serverClose(id));
    await db.register_sessions.findOne(id).exec(); // another reader of the session, such as a screen
    return row;
  }) as typeof db.cash_movements.insert;
  await expect(paidOut(id)).rejects.toBeInstanceOf(RegisterMovementStrandedError);
  expect(raced()).toBe(true);
  expect(await db.cash_movements.count().exec()).toBe(1);
});

// ADR-032 (the #156 review): a void re-reads its session after its writes, as `recordMovement`
// does after its insert. Revert: drop voidMovement's re-read.
it('flags a void stranded when a close lands between its check and its writes, and keeps it off the frozen closure', async () => {
  await ensureRegister(db.register_sessions, 'web');
  const { id } = await openSession(db.register_sessions, input);
  const [target, other] = [await paidOut(id), await paidOut(id)];
  // A void on a live session behaves as before.
  const live = await voidMovement(db.register_sessions, db.cash_movements, other.id, '7', db.closures);
  expect(live.toJSON()).toMatchObject({ type: 'void', voids: other.id });
  let frozen: unknown;
  const raced = duringNextReadById(async () => {
    await serverClose(id);
    const [session] = await db.register_sessions.storageInstance.findDocumentsById([id], false);
    frozen = (await writeClosure({
      closures: db.closures, register: db.register_sessions, storeKey: 'store', session, counted: 10000, otherTenders: {},
      movements: await db.cash_movements.find().exec(), orders: [], softwareVersion: '1.0.0',
    })).toJSON();
  });
  const error = await voidMovement(db.register_sessions, db.cash_movements, target.id, '7', db.closures).catch((e: unknown) => e);
  expect(raced()).toBe(true);
  expect(error).toBeInstanceOf(RegisterMovementStrandedError);
  const reversal = (error as RegisterMovementStrandedError).id;
  // Kept, not deleted, and not on the closure, which is unchanged.
  expect((await db.cash_movements.findOne(reversal).exec())?.toJSON()).toMatchObject({ type: 'void', voids: target.id });
  expect([...(frozen as { movement_ids: string[] }).movement_ids].sort()).toEqual([target.id, other.id, live.id].sort());
  expect((await db.closures.findOne(id).exec())?.toJSON()).toEqual(frozen);
});

// register-screens-a (the #160 review's nit): readClosure reads the closure by primary key with
// `findDocumentsById([id], false)`, the same "a deleted document counts as missing" rule
// `readSession` documents above. A repeated Undo on an already-voided movement reuses the first
// reversal (its id, already counted by a real closure written after the reversal existed), so
// this closure's movement_ids genuinely lists it — proving the outcome turns on the delete, not on
// the reversal being absent from the closure for some other reason. Revert: pass `true` (include
// deleted) and this test fails, because the deleted closure would still be found and its stale
// movement_ids would wrongly count the reversal as delivered, returning it instead of throwing.
it('treats a deleted closure document as missing, not as a closure that already counted the void', async () => {
  await ensureRegister(db.register_sessions, 'web');
  const { id } = await openSession(db.register_sessions, input);
  const target = await paidOut(id);
  // Voided while the session is still open: no closure check on this path, so the reversal is
  // minted for real before any closure exists.
  const reversal = await voidMovement(db.register_sessions, db.cash_movements, target.id, '7');
  await restart();
  let closureId = '';
  const raced = duringNextReadById(async () => {
    await closeSession(db.register_sessions, id, { counted: { cash: 10000 } });
    const [session] = await db.register_sessions.storageInstance.findDocumentsById([id], false);
    const closure = await writeClosure({
      closures: db.closures, register: db.register_sessions, storeKey: 'store', session, counted: 10000,
      otherTenders: {}, movements: await db.cash_movements.find().exec(), orders: [], softwareVersion: '1.0.0',
    });
    closureId = closure.id;
    // The closure genuinely counted the reversal at write time...
    expect(closure.movement_ids).toContain(reversal.id);
    // ...but the row is purged (a retention sweep, a mis-click) before voidMovement re-reads it.
    await closure.remove();
  });
  // A repeated Undo on the same, already-voided movement: reuses `reversal.id` rather than minting
  // a new one, so no new write lands between the closure write above and the read below.
  const error = await voidMovement(db.register_sessions, db.cash_movements, target.id, '7', db.closures).catch(
    (e: unknown) => e,
  );
  expect(raced()).toBe(true);
  expect(error).toBeInstanceOf(RegisterMovementStrandedError);
  expect((error as RegisterMovementStrandedError).id).toBe(reversal.id);
  // Truly gone from storage, not merely filtered out of a live query.
  expect(await db.closures.storageInstance.findDocumentsById([closureId], true)).toHaveLength(1);
});

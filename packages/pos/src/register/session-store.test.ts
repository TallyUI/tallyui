// @vitest-environment node
// Ported from WCPOS `next` `3b5331b5c` `session-store.test.ts` (ADR-032 amendment 1). Money is
// minor units at exponent 2: WCPOS's '100' becomes 10000. Actors are string ids: 7 becomes '7'.
//
// Dropped:
//   - 're-queues a refused movement so the outbox will send it again': `retryMovement` is
//     outbox-only and moves to registers job c.
// Changed: the outbox's `sync_status` assertions are gone (no outbox on these collections), and
// so is the gate's refusal of a `sync_status: 'failed'` session, which only the outbox sets.
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { createOrderBuilder } from '../order/order-builder';
import { toOrderCreateEnvelope } from '../pos-order/command';
import { finalizeOrder } from '../pos-order/finalize';
import { cashMovementSchema, closureSchema, registerSessionSchema } from './schemas';
import {
  backToSelling,
  closeSession,
  openSession,
  recordMovement,
  RegisterSessionClosedError,
  RegisterSessionRequiredError,
  requireOpenSession,
  stampSession,
  startCounting,
  voidMovement,
  type CashMovementCollection,
  type ClosureCollection,
  type RegisterSessionCollection,
} from './session-store';

let db: RxDatabase<{
  register_sessions: RegisterSessionCollection; cash_movements: CashMovementCollection; closures: ClosureCollection;
}>;
beforeEach(async () => {
  db = await createRxDatabase({
    name: `session${Math.random().toString(36).slice(2)}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    multiInstance: false,
  });
  await db.addCollections({
    register_sessions: { schema: registerSessionSchema },
    cash_movements: { schema: cashMovementSchema },
    closures: { schema: closureSchema },
  });
});
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

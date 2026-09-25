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
import { cashMovementSchema, registerSessionSchema } from './schemas';
import {
  backToSelling,
  closeSession,
  openSession,
  recordMovement,
  requireOpenSession,
  startCounting,
  voidMovement,
  type CashMovementCollection,
  type RegisterSessionCollection,
} from './session-store';

let db: RxDatabase<{ register_sessions: RegisterSessionCollection; cash_movements: CashMovementCollection }>;
beforeEach(async () => {
  db = await createRxDatabase({
    name: `session${Math.random().toString(36).slice(2)}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    multiInstance: false,
  });
  await db.addCollections({
    register_sessions: { schema: registerSessionSchema },
    cash_movements: { schema: cashMovementSchema },
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
  const row = await recordMovement(db.cash_movements, {
    sessionId: session.id,
    type: 'paid_out',
    amountMinor: 700,
    reason: 'Milk',
    actor: '7',
  });
  const [reversal, concurrent] = await Promise.all([
    voidMovement(db.cash_movements, row.id, '7'),
    voidMovement(db.cash_movements, row.id, '7'),
  ]);
  expect(concurrent.id).toBe(reversal.id);
  const repeated = await voidMovement(db.cash_movements, row.id, '7');
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

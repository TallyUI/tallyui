// @vitest-environment node
// Ported from WCPOS `next` `3b5331b5c` `session-store.test.ts` (ADR-032 amendment 1). Money is
// minor units at exponent 2: WCPOS's '100' becomes 10000. Actors are string ids: 7 becomes '7'.
//
// Dropped:
//   - 're-queues a refused movement so the outbox will send it again': `retryMovement` is
//     outbox-only and moves to registers job c.
// Changed: the outbox's `sync_status` assertions are gone (no outbox on these collections), and
// so is the gate's refusal of a `sync_status: 'failed'` session, which only the outbox sets.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { createOrderBuilder } from '../order/order-builder';
import { orderDraftSchema, restoreOrderDraft } from '../order/order-drafts';
import type { Payment } from '../order/types';
import { toOrderCreateEnvelope } from '../pos-order/command';
import { finalizeOrder } from '../pos-order/finalize';
import { reopenRefusedOrder } from '../pos-order/reopen';
import { posOrderCollection } from '../pos-order/schema';
import type { PosOrder } from '../pos-order/types';
import type { PosRefund } from '../refund/pos-refund';
import { ensureRegister, readRegister } from './register-document';
import { cashMovementSchema, closureSchema, registerSessionCreator, type RegisterSession } from './schemas';
import { serverClose as closeOnServer } from './server-close.test-helper';
import { writeOffLeg } from '../tender/cash-rounding';
import {
  backToSelling,
  closeSession,
  isKnownSessionStatus,
  openSession,
  recordMovement,
  RegisterMovementAmountError,
  RegisterMovementReasonError,
  RegisterMovementStrandedError,
  RegisterNeedsUpgradeError,
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
    register_sessions: registerSessionCreator(),
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

describe('closure refunds (ADR-080 amendment 1)', () => {
  const refund = (id: string, sessionId: string, byMethod: Record<string, number>, status: PosRefund['status'] = 'applied'): PosRefund => {
    const createdAt = '2026-10-07T10:00:00.000Z';
    const totalMinor = Object.values(byMethod).reduce((sum, amount) => sum + amount, 0);
    const envelope: PosRefund['envelope'] = {
      id: `command-${id}`, type: 'order.refund', version: 1, createdAt, deviceId: 'till', attempt: 1,
      payload: { clientRefundId: id, orderId: 'order', sessionId, registerId: 'register', createdAt,
        lines: [], shippingMinor: totalMinor, adjustmentMinor: 0, totalMinor, destination: 'cash', reason: 'Return' },
    };
    return { id, commandId: envelope.id, orderId: 'order', sessionId, registerId: 'register', envelope,
      status, result: { byMethod, totalMinor, refunds: [] }, createdAt, updatedAt: createdAt };
  };
  async function closedInput() {
    await ensureRegister(db.register_sessions, 'web');
    const doc = await openSession(db.register_sessions, input);
    const session = await closeSession(db.register_sessions, doc.id, { counted: { cash: 14000, external: 2600 }, closedBy: '7' });
    const order: PosOrder = {
      id: `order-${session.id}`, commandId: 'sale', sessionId: session.id,
      createdAt: '2026-10-07T09:00:00.000Z', updatedAt: '2026-10-07T09:00:00.000Z',
      currency: 'EUR', pricesIncludeTax: false, lines: [], subtotalMinor: 8000, discountMinor: 0,
      taxMinor: 0, totalMinor: 8000, customer: null, syncStatus: 'pending',
      taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' },
      payments: [{ id: 'cash', method: 'cash', amountMinor: 5000 }, { id: 'card', method: 'external', amountMinor: 3000 }],
    };
    return { closures: db.closures, register: db.register_sessions, storeKey: 'store', session,
      counted: 14000, otherTenders: { external: 2600 }, movements: [], orders: [order], softwareVersion: '1.0.0' };
  }
  const perpetualRefunds = async () => (await readRegister(db.register_sessions))?.stores.store?.registers?.register?.perpetual_refunds_total_minor;

  it('counts applied session refunds in every closure figure and the perpetual total', async () => {
    const baseline = await writeClosure(await closedInput());
    const args = await closedInput();
    const closure = await writeClosure({ ...args, refunds: [
      refund('cash-refund', args.session.id, { cash: 1000 }),
      refund('card-refund', args.session.id, { external: 400 }),
      refund('other-refund', 'other', { cash: 999 }),
      refund('pending-refund', args.session.id, { cash: 50 }, 'pending'),
    ] });
    expect(closure.toJSON().till_expected).toStrictEqual({ cash: baseline.till_expected.cash - 1000, external: baseline.till_expected.external - 400 });
    expect(closure.toJSON().variance).toStrictEqual({ cash: baseline.variance.cash + 1000, external: baseline.variance.external + 400 });
    expect(closure.period_refunds_total_minor).toBe(1400);
    expect(closure.toJSON().breakdowns.payment_methods).toStrictEqual({
      cash: { sales_minor: 5000, refunds_minor: 1000 }, external: { sales_minor: 3000, refunds_minor: 400 },
    });
    expect(closure.breakdowns.refund_count).toBe(2);
    expect(closure.toJSON().breakdowns.refund_ids).toStrictEqual(['cash-refund', 'card-refund']);
    expect(closure.toJSON().breakdowns.pending_refund_ids).toStrictEqual(['pending-refund']);
    expect(await perpetualRefunds()).toBe(1400);
  });

  it('adds a payment method that has refunds but no sales', async () => {
    const args = await closedInput();
    const closure = await writeClosure({ ...args, refunds: [refund('voucher', args.session.id, { voucher: 300 })] });
    expect(closure.toJSON().breakdowns.payment_methods).toStrictEqual({ cash: { sales_minor: 5000, refunds_minor: 0 },
      external: { sales_minor: 3000, refunds_minor: 0 }, voucher: { sales_minor: 0, refunds_minor: 300 } });
    expect(closure.till_expected.voucher).toBe(-300);
  });

  it('keeps a __proto__ method id as an ordinary own key in the persisted payment methods', async () => {
    const args = await closedInput();
    const byMethod = JSON.parse('{"__proto__":300}') as Record<string, number>;
    const closure = await writeClosure({ ...args, refunds: [refund('proto', args.session.id, byMethod)] });
    const methods = closure.toJSON().breakdowns.payment_methods as Record<string, unknown>;
    expect(Object.hasOwn(methods, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(methods, '__proto__')?.value).toStrictEqual({ sales_minor: 0, refunds_minor: 300 });
    expect(Object.getPrototypeOf(methods)).toBe(Object.prototype);
  });

  it('keeps tillExpected authoritative while counting refund totals', async () => {
    const args = await closedInput();
    const tillExpected = { cash: 123, external: 456 };
    const closure = await writeClosure({ ...args, tillExpected, refunds: [refund('cash', args.session.id, { cash: 1000 })] });
    expect(closure.toJSON().till_expected).toStrictEqual(tillExpected);
    expect(closure.period_refunds_total_minor).toBe(1000);
  });

  it('omits refund id keys when no refunds argument is passed', async () => {
    const closure = await writeClosure(await closedInput());
    expect(closure.breakdowns).not.toHaveProperty('refund_ids');
    expect(closure.breakdowns).not.toHaveProperty('pending_refund_ids');
    expect(closure.period_refunds_total_minor).toBe(0);
  });

  it('includes empty refund id lists when refunds is empty', async () => {
    const closure = await writeClosure({ ...await closedInput(), refunds: [] });
    expect(closure.breakdowns.refund_ids).toStrictEqual([]);
    expect(closure.breakdowns.pending_refund_ids).toStrictEqual([]);
    expect(closure.period_refunds_total_minor).toBe(0);
  });

  it('returns the frozen closure on a repeat close without adding to perpetual refunds again', async () => {
    const args = await closedInput();
    const first = (await writeClosure({ ...args, refunds: [refund('first', args.session.id, { cash: 1000 })] })).toJSON();
    const second = await writeClosure({ ...args, refunds: [refund('second', args.session.id, { cash: 9000 })] });
    expect(second.toJSON()).toStrictEqual(first);
    expect(await perpetualRefunds()).toBe(1000);
  });
});
it('a cashier move on a session whose status this build does not know refuses with RegisterNeedsUpgradeError and leaves the row unchanged', async () => {
  const session = await db.register_sessions.insert({
    id: 'unknown-status', register_id: 'register', status: 'abandoned-by-till' as unknown as RegisterSession['status'],
    opened_at_gmt: '2026-09-16T08:00:00.000Z', counted_float_minor: 10000,
  });
  const before = await db.register_sessions.storageInstance.findDocumentsById([session.id], false);
  await expect(startCounting(db.register_sessions, session.id)).rejects.toBeInstanceOf(RegisterNeedsUpgradeError);
  await expect(backToSelling(db.register_sessions, session.id)).rejects.toBeInstanceOf(RegisterNeedsUpgradeError);
  await expect(closeSession(db.register_sessions, session.id, { counted: { cash: 10000 } })).rejects.toBeInstanceOf(RegisterNeedsUpgradeError);
  const after = await db.register_sessions.storageInstance.findDocumentsById([session.id], false);
  const withoutRevisionMetadata = ({ _rev, _meta, ...data }: (typeof before)[number]) => data;
  expect(after.map(withoutRevisionMetadata)).toEqual(before.map(withoutRevisionMetadata));
  expect(after[0]?.status).toBe('abandoned-by-till');
});

it('stamping or recording cash on a session whose status this build does not know refuses with RegisterNeedsUpgradeError', async () => {
  const session = await db.register_sessions.insert({
    id: 'unknown-status', register_id: 'register', status: 'abandoned-by-till' as unknown as RegisterSession['status'],
    opened_at_gmt: '2026-09-16T08:00:00.000Z', counted_float_minor: 10000,
  });
  await expect(stampSession({ id: 'order' } as PosOrder, session.id, db.register_sessions)).rejects.toBeInstanceOf(RegisterNeedsUpgradeError);
  await expect(recordMovement(db.register_sessions, db.cash_movements, db.closures, {
    sessionId: session.id, type: 'paid_out', amountMinor: 700, reason: 'Milk', actor: '7',
  })).rejects.toBeInstanceOf(RegisterNeedsUpgradeError);
  expect(await db.cash_movements.find().exec()).toHaveLength(0);
});

it('an abandoned session is terminal: no transition, stamp or cash movement', async () => {
  const session = await db.register_sessions.insert({
    id: 'abandoned-session', register_id: 'register', status: 'abandoned',
    opened_at_gmt: '2026-09-16T08:00:00.000Z', counted_float_minor: 10000,
  });
  const before = await db.register_sessions.storageInstance.findDocumentsById([session.id], false);
  await expect(startCounting(db.register_sessions, session.id)).rejects.toThrow('invalid_session_transition:abandoned->counting');
  await expect(closeSession(db.register_sessions, session.id, { counted: { cash: 10000 } }))
    .rejects.toThrow('invalid_session_transition:abandoned->closed');
  await expect(stampSession({ id: 'order' } as PosOrder, session.id, db.register_sessions)).rejects.toBeInstanceOf(RegisterSessionClosedError);
  await expect(recordMovement(db.register_sessions, db.cash_movements, db.closures, {
    sessionId: session.id, type: 'paid_out', amountMinor: 700, reason: 'Milk', actor: '7',
  })).rejects.toBeInstanceOf(RegisterSessionClosedError);
  const after = await db.register_sessions.storageInstance.findDocumentsById([session.id], false);
  const withoutRevisionMetadata = ({ _rev, _meta, ...data }: (typeof before)[number]) => data;
  expect(after.map(withoutRevisionMetadata)).toEqual(before.map(withoutRevisionMetadata));
  expect(await db.cash_movements.find().exec()).toHaveLength(0);
});

it('isKnownSessionStatus knows abandoned', () => {
  expect(isKnownSessionStatus('abandoned')).toBe(true);
});

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
  for (const reason of ['  ok  ', 'x'.repeat(500)]) {
    const row = await recordMovement(db.register_sessions, db.cash_movements, db.closures, {
      sessionId: session.id, type: 'paid_out', amountMinor: 700, reason, actor: '7',
    });
    expect(row.reason).toBe(reason.trim());
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

it('stores the first close approval on the session without putting it on the Z', async () => {
  await ensureRegister(db.register_sessions, 'web');
  const doc = await openSession(db.register_sessions, input);
  const closed = await closeSession(db.register_sessions, doc.id, {
    counted: { cash: 9000 }, closedBy: '7', approvedBy: 'mgr-1', approval: 'proof-1',
  });
  expect(closed.approver_token).toBe('proof-1');
  expect(closed.approved_by).toBe('mgr-1');
  const again = await closeSession(db.register_sessions, doc.id, { counted: { cash: 9000 }, approval: 'proof-2' });
  expect(again.approver_token).toBe('proof-1');
  const closure = await writeClosure({
    closures: db.closures, register: db.register_sessions, storeKey: 'store', session: closed, counted: 9000,
    otherTenders: {}, movements: [], orders: [], softwareVersion: '1.0.0',
  });
  expect(JSON.stringify(closure.toJSON())).not.toContain('proof-1');
});

it('closeSession writes the note with the count', async () => {
  const doc = await openSession(db.register_sessions, input);
  const closed = await closeSession(db.register_sessions, doc.id, { counted: { cash: 9000 }, note: 'Float short' });
  expect(closed.toJSON()).toMatchObject({ status: 'closed', counted: { cash: 9000 }, count_note: 'Float short' });
});

it('a blank note is stored as null', async () => {
  const doc = await openSession(db.register_sessions, input);
  const closed = await closeSession(db.register_sessions, doc.id, { counted: { cash: 9000 }, note: '   ' });
  expect(closed.count_note).toBeNull();
});

it('closeSession stores the note trimmed', async () => {
  const doc = await openSession(db.register_sessions, input);
  const closed = await closeSession(db.register_sessions, doc.id, { counted: { cash: 9000 }, note: '  short by 5  ' });
  expect(closed.count_note).toBe('short by 5');
});

it("a repeat close keeps the first close's note", async () => {
  const doc = await openSession(db.register_sessions, input);
  await closeSession(db.register_sessions, doc.id, { counted: { cash: 9000 }, note: 'First' });
  const again = await closeSession(db.register_sessions, doc.id, { counted: { cash: 1 }, note: 'Second' });
  expect(again.count_note).toBe('First');
  expect((await db.register_sessions.findOne(doc.id).exec())?.count_note).toBe('First');
});

it('writeClosure freezes a non-blank count_note as breakdowns.variance_note, and omits it when blank', async () => {
  await ensureRegister(db.register_sessions, 'web');
  const close = async (note?: string) => {
    const doc = await openSession(db.register_sessions, input);
    return closeSession(db.register_sessions, doc.id, { counted: { cash: 9000 }, note });
  };
  const freeze = async (session: RegisterSession) => writeClosure({
    closures: db.closures, register: db.register_sessions, storeKey: 'store', session, counted: 9000,
    otherTenders: {}, movements: [], orders: [], softwareVersion: '1.0.0',
  });
  expect((await freeze(await close('Float short'))).breakdowns.variance_note).toBe('Float short');
  // closeSession already nulls a blank note; patch the local-only row so writeClosure's own trim is what runs.
  const blank = await (await close()).incrementalPatch({ count_note: '  ' });
  expect(blank.count_note).toBe('  ');
  expect((await freeze(blank)).breakdowns).not.toHaveProperty('variance_note');
});

it('a session opened after the upgrade stores count_note null', async () => {
  const doc = await openSession(db.register_sessions, input);
  expect(doc.toJSON()).toHaveProperty('count_note', null);
  expect((await db.register_sessions.findOne(doc.id).exec())?.toJSON()).toHaveProperty('count_note', null);
});

it('leaves approver_token null when the close has no approval', async () => {
  const doc = await openSession(db.register_sessions, input);
  const closed = await closeSession(db.register_sessions, doc.id, { counted: { cash: 9000 } });
  expect(closed.approver_token).toBeNull();
});

it.each(['pending', 'discarded', 'different sale', 'finalized'])('counts refused cash once with a %s draft', async (state) => {
  await ensureRegister(db.register_sessions, 'web');
  const session = await openSession(db.register_sessions, input);
  const { pos_orders, order_drafts } = await db.addCollections({ pos_orders: posOrderCollection(), order_drafts: { schema: orderDraftSchema } });
  const taxContext = { pricesIncludeTax: false, getTaxRatePpm: () => 0 };
  const orders: PosOrder[] = [100, 200, 400].map((amountMinor, i) => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 0 } });
    builder.addLine({ productId: 'shirt', name: 'Shirt', unitPrice: { amount: amountMinor, currency: 'EUR' } });
    builder.addPayment({ method: 'cash', amountMinor });
    return { ...finalizeOrder(builder.getSnapshot()), sessionId: session.id,
      syncStatus: i === 0 ? 'applied' : 'rejected', ...(i === 2 ? { error: { code: 'coupon_invalid', message: 'Refused' } } : {}) };
  });
  await pos_orders.bulkInsert(orders);
  await reopenRefusedOrder(orders[2].id, { orders: pos_orders, drafts: order_drafts, sessions: db.register_sessions, taxContext });
  const parked = (await order_drafts.findOne(orders[2].id).exec())!;
  if (state === 'finalized') {
    const restored = restoreOrderDraft(JSON.parse(parked.data), { currency: 'EUR', taxContext });
    await pos_orders.insert({ ...finalizeOrder(restored.getSnapshot()), sessionId: session.id });
  } else if (state === 'different sale') {
    await pos_orders.insert({ ...orders[2], id: 'different', saleId: 'another-sale', syncStatus: 'applied' });
  }
  if (state !== 'pending') await parked.remove();
  const stored = (await pos_orders.find().exec()).map((row) => row.toJSON() as PosOrder);
  expect(stored.find((order) => order.id === orders[2].id)!.reopenedAt).toBeDefined();
  const salesMinor = state === 'different sale' ? 1100 : 700;
  const closed = await closeSession(db.register_sessions, session.id, { counted: { cash: 10000 + salesMinor } });
  const closure = await writeClosure({
    closures: db.closures, register: db.register_sessions, storeKey: 'store', session: closed, counted: 10000 + salesMinor,
    otherTenders: {}, movements: [], orders: stored, softwareVersion: '1.0.0',
  });
  expect(closure.expected).toEqual({ cash: 10000 + salesMinor });
  expect(closure.breakdowns.payment_methods).toEqual({ cash: { sales_minor: salesMinor, refunds_minor: 0 } });
  expect(closure.period_sales_total_minor).toBe(salesMinor);
  expect(closure.order_ids).toEqual(stored.filter((order) => state !== 'finalized' || order.id !== orders[2].id).map((order) => order.id));
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

describe('openSession without storeKey is deprecated (#1068)', () => {
  /** A fresh session-store module, so its once-per-module warning flag starts unset. */
  const freshOpen = async () => {
    vi.resetModules();
    return (await import('./session-store')).openSession;
  };
  const prefix = '[@tallyui/pos] openSession without storeKey is deprecated';
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
    vi.unstubAllEnvs();
  });

  it('K4: warns once per module instance, however many sessions open without one', async () => {
    const open = await freshOpen();
    await open(db.register_sessions, input);
    await open(db.register_sessions, { ...input, storeKey: null });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0]).startsWith(prefix)).toBe(true);
  });

  it('K5: does not warn when storeKey is passed', async () => {
    const open = await freshOpen();
    const doc = await open(db.register_sessions, { ...input, storeKey: 'store' });
    expect(doc.store_key).toBe('store');
    expect(warn).not.toHaveBeenCalled();
  });

  it('K6: does not warn in production, and still writes store_key null', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const open = await freshOpen();
    const doc = await open(db.register_sessions, input);
    expect(doc.store_key).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});

it('Z1 uses the stored inclusive fee mode for the closure tax rates', async () => {
  await ensureRegister(db.register_sessions, 'web');
  const session = await openSession(db.register_sessions, input);
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 250000,
    rounding: { granularity: 'per_rate_group_items', mode: 'half_up' } } });
  builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: 800, currency: 'EUR' } });
  builder.addFee({ name: 'Charge', amountMinor: 1002, amountIncludesTax: true, taxClass: 'standard' });
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  const order = finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 5, chargeTaxMode: true } });
  const counted = input.countedFloatMinor + order.totalMinor;
  const closed = await closeSession(db.register_sessions, session.id, { counted: { cash: counted } });
  const closure = await writeClosure({ closures: db.closures, register: db.register_sessions, storeKey: 'store', session: closed,
    counted, otherTenders: {}, movements: [], orders: [{ ...order, sessionId: session.id }], softwareVersion: '1.0.0' });
  const rates = Object.values(closure.breakdowns.tax_rates as Record<string, { tax_minor: number; net_minor: number }>);
  expect(rates.reduce((sum, rate) => sum + rate.tax_minor, 0)).toBe(400);
  expect(rates.reduce((sum, rate) => sum + rate.net_minor, 0)).toBe(1602);
});

describe('cash rounding on the Z (ADR-094)', () => {
  // One sale of 10.02 including 10% tax (net 9.11, tax 0.91), taken as 10.00 in cash with its -2 entry, or as 10.02 unrounded.
  async function closureOfOneSale(rounded: boolean, legSessionId?: string) {
    await ensureRegister(db.register_sessions, 'web');
    const doc = await openSession(db.register_sessions, input);
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: true, getTaxRatePpm: () => 100_000 } });
    builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: 1002, currency: 'EUR' } });
    const taken = rounded ? 1000 : 1002;
    builder.addPayment({ method: 'cash', amountMinor: taken, tenderedMinor: taken, changeMinor: 0 }, rounded ? { minor: -2 } : undefined);
    const finalized = finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 12, cashRounding: true } });
    const order: PosOrder = { ...finalized, sessionId: doc.id, ...(legSessionId ? { payments: finalized.payments.map((payment) => ({ ...payment, sessionId: legSessionId })) } : {}) };
    const closed = await closeSession(db.register_sessions, doc.id, { counted: { cash: 10000 + taken } });
    return writeClosure({
      closures: db.closures, register: db.register_sessions, storeKey: 'store', session: closed, counted: 10000 + taken,
      otherTenders: {}, movements: [], orders: [order], softwareVersion: '1.0.0',
    });
  }

  it('writeClosure records the session\'s cash rounding total, and tax gross plus rounding equals taxed takings', async () => {
    const closure = await closureOfOneSale(true);
    expect(closure.breakdowns.cash_rounding_minor).toBe(-2);
    const taxRates = Object.values(closure.breakdowns.tax_rates as Record<string, { net_minor: number; tax_minor: number; gross_minor: number }>);
    expect(taxRates).toEqual([expect.objectContaining({ net_minor: 911, tax_minor: 91, gross_minor: 1002 })]);
    expect(closure.period_sales_total_minor).toBe(1000);
    expect(taxRates.reduce((sum, rate) => sum + rate.gross_minor, 0) + -2).toBe(closure.period_sales_total_minor);
  });

  it('an unrounded session\'s closure has no cash_rounding_minor key', async () => {
    const closure = await closureOfOneSale(false);
    expect(closure.period_sales_total_minor).toBe(1002);
    expect(closure.breakdowns).not.toHaveProperty('cash_rounding_minor');
  });

  it('a rounded leg taken in another session counts its rounding there, not on this Z', async () => {
    const closure = await closureOfOneSale(true, 'another-session');
    expect(closure.period_sales_total_minor).toBe(0);
    expect(closure.breakdowns).not.toHaveProperty('cash_rounding_minor');
  });

  // #1281: a parked or live sale's rounding counts as its leg's money does (S3), on the Z of the session that took the leg.
  const leg = (sessionId: string, id = 'leg', extra: Record<string, unknown> = {}) =>
    ({ id, method: 'cash', amountMinor: 1000, tenderedMinor: 1000, changeMinor: 0, status: 'captured', sessionId, ...extra }) as unknown as Payment;
  const draftOf = (payments: unknown[], cashRoundings: unknown) => ({ data: JSON.stringify({ payments, cashRoundings }) });
  const roundedOrder = (sessionId: string, legSessionId = sessionId): PosOrder => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: true, getTaxRatePpm: () => 100_000 } });
    builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: 1002, currency: 'EUR' } });
    builder.addPayment({ method: 'cash', amountMinor: 1000, tenderedMinor: 1000, changeMinor: 0 }, { minor: -2 });
    const finalized = finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 12, cashRounding: true } });
    return { ...finalized, sessionId, payments: finalized.payments.map((payment) => ({ ...payment, sessionId: legSessionId })) };
  };
  async function closeWith(extra: (sessionId: string) => Partial<Parameters<typeof writeClosure>[0]>, takenMinor = 0) {
    await ensureRegister(db.register_sessions, 'web');
    const doc = await openSession(db.register_sessions, input);
    const closed = await closeSession(db.register_sessions, doc.id, { counted: { cash: 10000 + takenMinor } });
    return writeClosure({
      closures: db.closures, register: db.register_sessions, storeKey: 'store', session: closed, counted: 10000 + takenMinor,
      otherTenders: {}, movements: [], orders: [], softwareVersion: '1.0.0', ...extra(doc.id),
    });
  }

  it('W1 #1281: a parked draft\'s rounded leg taken in this session counts its rounding here', async () => {
    const closure = await closeWith((id) => ({ drafts: [draftOf([leg(id)], [{ paymentId: 'leg', minor: -2 }])] }), 1000);
    expect(closure.breakdowns.cash_rounding_minor).toBe(-2);
    expect(closure.period_sales_total_minor).toBe(1000);
  });

  it('W2 #1281: a parked draft\'s rounded leg taken in another session counts nothing here', async () => {
    const closure = await closeWith(() => ({ drafts: [draftOf([leg('another-session')], [{ paymentId: 'leg', minor: -2 }])] }));
    expect(closure.breakdowns).not.toHaveProperty('cash_rounding_minor');
    expect(closure.period_sales_total_minor).toBe(0);
  });

  it('W3 #1281: the live sale\'s rounded leg taken in this session counts its rounding here', async () => {
    const closure = await closeWith((id) => ({ liveLegs: [leg(id)], liveRoundings: [{ paymentId: 'leg', minor: -2 }] }), 1000);
    expect(closure.breakdowns.cash_rounding_minor).toBe(-2);
    expect(closure.period_sales_total_minor).toBe(1000);
  });

  it('W4 #1281: the live sale\'s rounded leg taken in another session counts nothing here', async () => {
    const closure = await closeWith(() => ({ liveLegs: [leg('another-session')], liveRoundings: [{ paymentId: 'leg', minor: -2 }] }));
    expect(closure.breakdowns).not.toHaveProperty('cash_rounding_minor');
    expect(closure.period_sales_total_minor).toBe(0);
  });

  it('W5 #1281: a live +3 and a bound order\'s -2 in this session sum to 1', async () => {
    const closure = await closeWith((id) => ({
      orders: [roundedOrder(id)], liveLegs: [leg(id, 'live')], liveRoundings: [{ paymentId: 'live', minor: 3 }],
    }), 2000);
    expect(closure.breakdowns.cash_rounding_minor).toBe(1);
    expect(closure.period_sales_total_minor).toBe(2000);
  });

  it('W6 #1281: a parked entry naming a leg that is not taken (voided, or no such leg) counts nothing', async () => {
    const closure = await closeWith((id) => ({
      drafts: [draftOf([leg(id), leg(id, 'void', { status: 'voided' })], [{ paymentId: 'void', minor: -2 }, { paymentId: 'ghost', minor: 3 }])],
    }), 1000);
    expect(closure.breakdowns).not.toHaveProperty('cash_rounding_minor');
    expect(closure.period_sales_total_minor).toBe(1000);
  });

  it('W7 #1281: an unreadable draft counts nothing and does not throw', async () => {
    const closure = await closeWith(() => ({ drafts: [{ data: '{' }] }));
    expect(closure.breakdowns).not.toHaveProperty('cash_rounding_minor');
    expect(closure.period_sales_total_minor).toBe(0);
  });

  it('W8 #1281: live roundings without live legs count nothing', async () => {
    const closure = await closeWith(() => ({ liveRoundings: [{ paymentId: 'leg', minor: -2 }] }));
    expect(closure.breakdowns).not.toHaveProperty('cash_rounding_minor');
    expect(closure.period_sales_total_minor).toBe(0);
  });

  it('W9 #1281: a parked rounding counted on A\'s Z is not counted again when the sale finalizes in B', async () => {
    let a = '';
    const zA = await closeWith((id) => { a = id; return { drafts: [draftOf([leg(id)], [{ paymentId: 'leg', minor: -2 }])] }; }, 1000);
    expect(zA.breakdowns.cash_rounding_minor).toBe(-2);
    const zB = await closeWith((id) => ({ orders: [roundedOrder(id, a)] }));
    expect(zB.session_id).not.toBe(a);
    expect(zB.breakdowns).not.toHaveProperty('cash_rounding_minor');
    expect(zB.period_sales_total_minor).toBe(0);
  });

  it('C16 (ADR-094 item 1, 2026-11-26): cash 10.00 here and card 0.01 in session B: the -2 write-off goes on the cash leg and counts on this Z, not B\'s', async () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: true, getTaxRatePpm: () => 100_000 } });
    builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: 1003, currency: 'EUR' } });
    const cashId = builder.addPayment({ method: 'cash', amountMinor: 1000, tenderedMinor: 1000, changeMinor: 0 });
    builder.addPayment({ method: 'external', amountMinor: 1 });
    expect(writeOffLeg(builder.getSnapshot())?.id).toBe(cashId);
    builder.addCashRounding({ paymentId: cashId, minor: -2 });
    const finalized = finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 12, cashRounding: true } });
    const legsBy = (cashSession: string, cardSession: string): PosOrder => ({
      ...finalized, sessionId: cashSession,
      payments: finalized.payments.map((payment) => ({ ...payment, sessionId: payment.method === 'cash' ? cashSession : cardSession })),
    });
    let a = '';
    const zA = await closeWith((id) => { a = id; return { orders: [legsBy(id, 'session-b')] }; }, 1000);
    expect(zA.breakdowns.cash_rounding_minor).toBe(-2);
    const zB = await closeWith((id) => ({ orders: [legsBy(a, id)] }));
    expect(zB.breakdowns).not.toHaveProperty('cash_rounding_minor');
  });
});

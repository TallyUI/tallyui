// @vitest-environment node
// ADR-077 coupon amendment (Front desk, 2026-11-21, D2): a carried sale whose closed session's closure counted it
// reopens after close and is re-sent with its original time and register, in no session, with the counted payments.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { couponPricingBasis, createOrderBuilder } from '../order/order-builder';
import { orderDraftSchema, restoreOrderDraft } from '../order/order-drafts';
import type { Order } from '../order/types';
import { ensureRegister } from '../register/register-document';
import { closureSchema, registerSessionCreator } from '../register/schemas';
import {
  closeSession, openSession, startCounting, writeClosure, type ClosureCollection, type RegisterSessionCollection,
} from '../register/session-store';
import type { TaxContext } from '../tax/types';
import { toOrderCreateEnvelope } from './command';
import { AFTER_CLOSE_PAYMENTS_CHANGED, finalizeOrder } from './finalize';
import { replacedOrderIds } from './reopened';
import { ReopenRefusedOrderError, reopenRefusedOrder } from './reopen';
import { posOrderCollection } from './schema';
import type { PosOrder } from './types';
import { uuidv7 } from './uuidv7';

let db: RxDatabase<{
  pos_orders: RxCollection<PosOrder>; order_drafts: RxCollection; register_sessions: RegisterSessionCollection; closures: ClosureCollection;
}>;
const currency = 'GBP', now = new Date('2026-11-21T12:00:00.000Z'), registerId = 'register-a';
const capabilities = { orderCreate: 12 };
const taxContext: TaxContext = { getTaxRatePpm: () => 200000, pricesIncludeTax: false, rounding: { granularity: 'per_order', mode: 'half_away_from_zero' } };

beforeEach(async () => {
  db = await createRxDatabase({ name: `reopenafterclose${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  await db.addCollections({ pos_orders: posOrderCollection(), order_drafts: { schema: orderDraftSchema },
    register_sessions: registerSessionCreator(), closures: { schema: closureSchema } });
  await ensureRegister(db.register_sessions, 'web');
});
afterEach(async () => { await db.remove(); });

/** The two-line sale of reopen-carry's E1, priced by the store, paid in cash; without its coupon when `coupons` is false. */
function build(coupons = true): Order {
  const builder = createOrderBuilder({ currency, taxContext });
  builder.addLine({ productId: 'p1', name: 'Shirt', unitPrice: { amount: 1000, currency }, quantity: 2 });
  const second = builder.addLine({ productId: 'p2', name: 'Cap', unitPrice: { amount: 500, currency } });
  builder.applyLineDiscount(second, { type: 'fixed', value: 40, label: 'Staff' });
  const ids = builder.getSnapshot().lineItems.map((line) => line.id);
  if (coupons) builder.setCoupons(['save'], { kind: 'store-priced', basis: couponPricingBasis(builder.getSnapshot()),
    priced: new Map([['save', { couponId: 'c1', lines: [{ lineId: ids[0], amountMinor: 120 }, { lineId: ids[1], amountMinor: 30 }] }]]) });
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  return builder.getSnapshot();
}

/** A refused sale stamped into a session, then that session's state as `state` gives it. */
async function refusedIn(state: 'listed' | 'unlisted' | 'no-closure' | 'counting', coupons = true) {
  const session = await openSession(db.register_sessions, {
    registerId, storeKey: 'store', expectedFloatMinor: 0, countedFloatMinor: 0, openedBy: '7', businessDay: { year: 2026, month: 11, day: 21 },
  });
  const order: PosOrder = { ...finalizeOrder(build(coupons), { capabilities, registerId, now: new Date('2026-11-21T10:00:00.000Z') }),
    sessionId: session.id, syncStatus: 'rejected', error: { code: coupons ? 'coupon_invalid' : 'total_mismatch', message: 'x' } };
  await db.pos_orders.insert(order);
  if (state === 'counting') {
    await startCounting(db.register_sessions, session.id);
    return { order, sessionId: session.id };
  }
  const closed = await closeSession(db.register_sessions, session.id, { counted: { cash: 0 } });
  if (state !== 'no-closure') {
    await writeClosure({ closures: db.closures, register: db.register_sessions, storeKey: 'store', counted: 0, otherTenders: {},
      movements: [], orders: state === 'listed' ? [order] : [], session: closed, softwareVersion: '1.0.0' });
  }
  return { order, sessionId: session.id, closed };
}
const deps = (caps = capabilities) => ({ orders: db.pos_orders, drafts: db.order_drafts, sessions: db.register_sessions,
  closures: db.closures, taxContext, now: () => now, capabilities: caps });
async function draft(id: string): Promise<Order> {
  const row = await db.order_drafts.findOne(id).exec();
  expect(row).not.toBeNull();
  return JSON.parse(row!.data);
}
const restored = (saved: Order) => restoreOrderDraft(saved, { currency, taxContext }).getSnapshot();
async function expectRefused(order: PosOrder, reason: string, reopen: Promise<string>) {
  await expect(reopen).rejects.toBeInstanceOf(ReopenRefusedOrderError);
  await expect(reopen).rejects.toMatchObject({ reason });
  expect(await db.order_drafts.count().exec()).toBe(0);
  expect((await db.pos_orders.findOne(order.id).exec())!.reopenedAt).toBeUndefined();
}

describe('reopenRefusedOrder after close', () => {
  it('E5a a carried sale whose closed session\'s closure lists it reopens after close', async () => {
    const { order, sessionId } = await refusedIn('listed');
    const saved = await draft(await reopenRefusedOrder(order.id, deps()));
    expect(saved.afterClose).toEqual({ sessionId, createdAt: order.createdAt, registerId,
      payments: order.payments.map(({ method, amountMinor }) => ({ method, amountMinor })) });
    expect(saved.payments.map(({ method, amountMinor }) => ({ method, amountMinor }))).toEqual(saved.afterClose!.payments);
    expect(saved.coupons?.[0].carried).toBe(true);
    expect((await db.pos_orders.findOne(order.id).exec())!.reopenedAt).toBe(now.toISOString());
  });

  it('E5b the successor keeps its original time and register, joins no session and is marked counted in that closure', async () => {
    const { order, sessionId } = await refusedIn('listed');
    const saved = await draft(await reopenRefusedOrder(order.id, deps()));
    const successor = finalizeOrder(restored(saved), { capabilities, registerId: 'register-b', now });
    expect(successor.createdAt).toBe(order.createdAt);
    expect(successor.updatedAt).toBe(now.toISOString());
    expect(successor.registerId).toBe(registerId);
    expect(successor.countedInClosureOf).toBe(sessionId);
    expect(successor).not.toHaveProperty('sessionId');
    expect(successor).not.toHaveProperty('lateSessionId');
    const envelope = toOrderCreateEnvelope(successor, 'device', 1, { maxVersion: 12 });
    expect(envelope.payload).not.toHaveProperty('sessionId');
    expect(envelope.createdAt).toBe(order.createdAt);
  });

  it('E5c the frozen closure is unchanged by the reopen, the successor and writeClosure run again', async () => {
    const { order, closed } = await refusedIn('listed');
    const before = (await db.closures.findOne(closed!.id).exec())!.toJSON();
    const saved = await draft(await reopenRefusedOrder(order.id, deps()));
    const successor = finalizeOrder(restored(saved), { capabilities, now });
    await db.pos_orders.insert(successor);
    const orders = (await db.pos_orders.find().exec()).map((row) => row.toJSON() as PosOrder);
    await writeClosure({ closures: db.closures, register: db.register_sessions, storeKey: 'store', counted: 0, otherTenders: {},
      movements: [], orders, session: closed!, softwareVersion: '1.0.0' });
    expect((await db.closures.findOne(closed!.id).exec())!.toJSON()).toEqual(before);
  });

  it('E5d the refused row and its successor are one sale at the order\'s total', async () => {
    const { order } = await refusedIn('listed');
    const saved = await draft(await reopenRefusedOrder(order.id, deps()));
    await db.pos_orders.insert(finalizeOrder(restored(saved), { capabilities, now }));
    const rows = (await db.pos_orders.find().exec()).map((row) => row.toJSON() as PosOrder);
    expect(rows).toHaveLength(2);
    const replaced = replacedOrderIds(rows);
    const sales = rows.filter((row) => !replaced.has(row.id));
    expect(sales.map((sale) => sale.totalMinor)).toEqual([order.totalMinor]);
    expect(sales[0].payments.reduce((sum, payment) => sum + payment.amountMinor, 0)).toBe(order.totalMinor);
  });

  describe('E5e refuses session_closed, writing nothing', () => {
    it.each([
      ['a counting session', 'counting'], ['a closed session with no closure', 'no-closure'],
      ['a closed session whose closure does not list the order', 'unlisted'],
    ] as const)('%s', async (_name, state) => {
      const { order } = await refusedIn(state);
      await expectRefused(order, 'session_closed', reopenRefusedOrder(order.id, deps()));
    });
    it('closed and listed, but withoutCoupons', async () => {
      const { order } = await refusedIn('listed');
      await expectRefused(order, 'session_closed', reopenRefusedOrder(order.id, deps(), { withoutCoupons: true }));
    });
    it('closed and listed, but coupon-free', async () => {
      const { order } = await refusedIn('listed', false);
      await expectRefused(order, 'session_closed', reopenRefusedOrder(order.id, deps()));
    });
    it('closed and listed, but no closures dep', async () => {
      const { order } = await refusedIn('listed');
      const { closures: _closures, ...without } = deps();
      await expectRefused(order, 'session_closed', reopenRefusedOrder(order.id, without));
    });
  });

  it('E5f closed and listed, an inexact carry refuses coupon_carry_inexact and writes nothing', async () => {
    const { order } = await refusedIn('listed');
    await expectRefused(order, 'coupon_carry_inexact', reopenRefusedOrder(order.id, deps({ orderCreate: 3 })));
  });

  describe('E5g finalize keeps the payments the closure counted', () => {
    async function afterCloseDraft() {
      const { order } = await refusedIn('listed');
      return restored(await draft(await reopenRefusedOrder(order.id, deps())));
    }
    it.each([
      ['an added payment', (o: Order): Order => ({ ...o, payments: [...o.payments, { ...o.payments[0], id: 'extra', amountMinor: 100 }] })],
      ['a changed amount', (o: Order): Order => ({ ...o, payments: [{ ...o.payments[0], amountMinor: o.payments[0].amountMinor + 100 }] })],
      ['a changed method', (o: Order): Order => ({ ...o, payments: [{ ...o.payments[0], method: 'external' }] })],
    ] as const)('%s refuses AFTER_CLOSE_PAYMENTS_CHANGED', async (_name, change) => {
      const saved = await afterCloseDraft();
      expect(() => finalizeOrder(change(saved), { capabilities, now })).toThrow(AFTER_CLOSE_PAYMENTS_CHANGED);
    });
    it('the unchanged draft finalizes', async () => {
      const saved = await afterCloseDraft();
      expect(finalizeOrder(saved, { capabilities, now }).totalMinor).toBe(saved.totalMinor);
    });
  });
});

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { couponPricingBasis, createOrderBuilder, type OrderBuilder } from '../order/order-builder';
import { orderDraftSchema, restoreOrderDraft } from '../order/order-drafts';
import type { Order } from '../order/types';
import { registerSessionCreator } from '../register/schemas';
import type { RegisterSessionCollection } from '../register/session-store';
import type { TaxContext } from '../tax/types';
import { toOrderCreateEnvelope } from './command';
import { finalizeOrder } from './finalize';
import { ReopenRefusedOrderError, reopenRefusedOrder } from './reopen';
import { posOrderCollection } from './schema';
import type { PosOrder } from './types';
import { uuidv7 } from './uuidv7';

let db: RxDatabase<{ pos_orders: RxCollection<PosOrder>; order_drafts: RxCollection; register_sessions: RegisterSessionCollection }>;
const currency = 'GBP', now = new Date('2026-11-21T12:00:00.000Z');
const capabilities = { orderCreate: 12 };
type Granularity = 'per_order' | 'per_line_items';
const taxContext = (pricesIncludeTax: boolean, granularity: Granularity = 'per_order'): TaxContext =>
  ({ getTaxRatePpm: () => 200000, pricesIncludeTax, rounding: { granularity, mode: 'half_away_from_zero' } });

beforeEach(async () => {
  db = await createRxDatabase({ name: `reopencarry${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  await db.addCollections({ pos_orders: posOrderCollection(), order_drafts: { schema: orderDraftSchema },
    register_sessions: registerSessionCreator() });
});
afterEach(async () => { await db.remove(); });

/** code to [stored line index, the store's amount][] */
type Priced = Record<string, Array<[number, number]>>;
interface Fixture { context: TaxContext; add: (builder: OrderBuilder) => void; codes: Priced }

/** The sale as the store priced it (a store-priced, not carried, context), or the same sale without its coupons. */
function build({ context, add, codes }: Fixture, coupons = true): Order {
  const builder = createOrderBuilder({ currency, taxContext: context });
  add(builder);
  const ids = builder.getSnapshot().lineItems.map((line) => line.id);
  if (coupons) builder.setCoupons(Object.keys(codes), { kind: 'store-priced', basis: couponPricingBasis(builder.getSnapshot()),
    priced: new Map(Object.entries(codes).map(([code, lines], k) => [code, { couponId: `c${k + 1}`,
      lines: lines.map(([i, amountMinor]) => ({ lineId: ids[i], amountMinor })) }])) });
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  return builder.getSnapshot();
}
function stored(fixture: Fixture): PosOrder {
  return { ...finalizeOrder(build(fixture), { capabilities, now: new Date('2026-11-21T10:00:00.000Z') }),
    syncStatus: 'rejected', error: { code: 'coupon_invalid', message: 'x' } };
}
const effect = (fixture: Fixture) => build(fixture, false).totalMinor - build(fixture).totalMinor;
const deps = (context: TaxContext, caps: { orderCreate: number } | null = capabilities) => ({ orders: db.pos_orders,
  drafts: db.order_drafts, sessions: db.register_sessions, taxContext: context, now: () => now, ...(caps ? { capabilities: caps } : {}) });
async function draft(id: string): Promise<Order> {
  const row = await db.order_drafts.findOne(id).exec();
  expect(row).not.toBeNull();
  return JSON.parse(row!.data);
}
function expectSameFigures(saved: Order, order: PosOrder) {
  expect({ totalMinor: saved.totalMinor, taxMinor: saved.taxMinor }).toEqual({ totalMinor: order.totalMinor, taxMinor: order.taxMinor });
  expect(saved.lineItems.map((line) => ({ netMinor: line.netMinor, taxMicros: line.taxLines.map((tax) => tax.taxMicros) })))
    .toEqual(order.lines.map((line) => ({ netMinor: line.netMinor, taxMicros: line.taxLines.map((tax) => tax.taxMicros) })));
}
async function expectInexact(order: PosOrder, context: TaxContext, caps?: { orderCreate: number } | null, toCollectMinor?: number) {
  const refused = reopenRefusedOrder(order.id, deps(context, caps));
  await expect(refused).rejects.toBeInstanceOf(ReopenRefusedOrderError);
  await expect(refused).rejects.toMatchObject({ reason: 'coupon_carry_inexact',
    ...(toCollectMinor !== undefined ? { toCollectMinor } : {}) });
  expect(await db.order_drafts.count().exec()).toBe(0);
  expect((await db.pos_orders.findOne(order.id).exec())!.reopenedAt).toBeUndefined();
}

const twoLines = (pricesIncludeTax: boolean, granularity: Granularity = 'per_order'): Fixture => ({
  context: taxContext(pricesIncludeTax, granularity), codes: { save: [[0, 120], [1, 30]] },
  add: (builder) => {
    builder.addLine({ productId: 'p1', name: 'Shirt', unitPrice: { amount: 1000, currency }, quantity: 2 });
    const second = builder.addLine({ productId: 'p2', name: 'Cap', unitPrice: { amount: 500, currency } });
    builder.applyLineDiscount(second, { type: 'fixed', value: 40, label: 'Staff' });
    builder.applyOrderDiscount({ type: 'fixed', value: 150 });
  },
});
const equalLines = (pricesIncludeTax: boolean): Fixture => ({
  context: taxContext(pricesIncludeTax), codes: { save: [[0, 60], [1, 60]] },
  add: (builder) => {
    for (let i = 0; i < 2; i++) builder.addLine({ productId: 'p1', name: 'Shirt', unitPrice: { amount: 1000, currency }, separate: true });
  },
});
const twoCoupons = (pricesIncludeTax: boolean): Fixture => ({
  context: taxContext(pricesIncludeTax), codes: { a: [[0, 120], [1, 60]], b: [[1, 30]] },
  add: (builder) => {
    builder.addLine({ productId: 'p1', name: 'Shirt', unitPrice: { amount: 1000, currency }, quantity: 2 });
    builder.addLine({ productId: 'p2', name: 'Cap', unitPrice: { amount: 500, currency } });
  },
});
const oneLine = (pricesIncludeTax: boolean, gross = 1000, amount = 70): Fixture => ({
  context: taxContext(pricesIncludeTax), codes: { save: [[0, amount]] },
  add: (builder) => { builder.addLine({ productId: 'p1', name: 'Shirt', unitPrice: { amount: gross, currency } }); },
});

describe('reopenRefusedOrder carries store-priced coupons at the amounts charged', () => {
  it.each([
    [false, 'per_order'], [true, 'per_order'], [false, 'per_line_items'], [true, 'per_line_items'],
  ] as const)('E1 the draft equals the stored order: inclusive = %s, %s', async (pricesIncludeTax, granularity) => {
    const fixture = twoLines(pricesIncludeTax, granularity), order = stored(fixture);
    expect(order.display!.orderDiscountMinor).toBeGreaterThan(0);
    expect(effect(fixture)).toBeGreaterThan(0);
    await db.pos_orders.insert(order);
    const saved = await draft(await reopenRefusedOrder(order.id, deps(fixture.context)));
    expectSameFigures(saved, order);
    expect(saved.payments.map(({ method, amountMinor }) => ({ method, amountMinor })))
      .toEqual(order.payments.map(({ method, amountMinor }) => ({ method, amountMinor })));
    expect(saved.coupons).toEqual([expect.objectContaining({ code: 'save', couponId: 'c1', carried: true })]);
    expect((await db.pos_orders.findOne(order.id).exec())!.reopenedAt).toBe(now.toISOString());
  });

  it.each([false, true])('E1 two equal lines stay two lines: inclusive = %s', async (pricesIncludeTax) => {
    const fixture = equalLines(pricesIncludeTax), order = stored(fixture);
    expect(order.lines).toHaveLength(2);
    await db.pos_orders.insert(order);
    const saved = await draft(await reopenRefusedOrder(order.id, deps(fixture.context)));
    expect(saved.lineItems).toHaveLength(2);
    expectSameFigures(saved, order);
    expect(saved.coupons?.[0].carried).toBe(true);
  });

  it.each([false, true])('E2 two coupons on overlapping lines keep both codes in order: inclusive = %s', async (pricesIncludeTax) => {
    const fixture = twoCoupons(pricesIncludeTax), order = stored(fixture);
    expect(order.coupons!.map((coupon) => coupon.code)).toEqual(['a', 'b']);
    await db.pos_orders.insert(order);
    const saved = await draft(await reopenRefusedOrder(order.id, deps(fixture.context)));
    expectSameFigures(saved, order);
    expect(saved.coupons!.map(({ code, carried }) => ({ code, carried }))).toEqual([{ code: 'a', carried: true }, { code: 'b', carried: true }]);
  });

  it.each([
    ['exclusive two lines', twoLines(false)], ['inclusive two lines', twoLines(true)],
    ['inclusive one line, gross 100, store amount 2', oneLine(true, 100, 2)],
  ] as const)('E3 the restored draft finalizes and sends no code: %s', async (_name, fixture) => {
    const order = stored(fixture);
    await db.pos_orders.insert(order);
    const saved = await draft(await reopenRefusedOrder(order.id, deps(fixture.context)));
    const restored = restoreOrderDraft(saved, { currency, taxContext: fixture.context });
    const successor = finalizeOrder(restored.getSnapshot(), { capabilities });
    expect(JSON.stringify(toOrderCreateEnvelope(successor, 'device', 1, { maxVersion: 12 }).payload)).not.toContain('save');
    expect(successor.totalMinor).toBe(order.totalMinor);
    expect(successor.coupons?.[0].carried).toBe(true);
  });

  describe('E4 before schema 19 (no amountMinor)', () => {
    const strip = (order: PosOrder) => {
      for (const coupon of order.coupons ?? []) for (const line of coupon.lines ?? []) delete line.amountMinor;
      return order;
    };
    it.each([false, true])('a single-line order reopens and equals the stored order: inclusive = %s', async (pricesIncludeTax) => {
      const fixture = oneLine(pricesIncludeTax), order = strip(stored(fixture));
      expect(order.coupons![0].lines![0].discountTaxMinor).toBeGreaterThan(0);
      await db.pos_orders.insert(order);
      const saved = await draft(await reopenRefusedOrder(order.id, deps(fixture.context)));
      expectSameFigures(saved, order);
      expect(saved.coupons?.[0].carried).toBe(true);
    });
    it('an order whose shares moved by one minor unit between two lines refuses and writes nothing', async () => {
      const fixture = twoCoupons(false), order = strip(stored(fixture));
      const [first, second] = order.coupons![0].lines!;
      first.discountMinor += 1;
      second.discountMinor -= 1;
      await db.pos_orders.insert(order);
      await expectInexact(order, fixture.context);
    });
  });

  it.each([
    ['order.create 3', { orderCreate: 3 }], ['no capabilities', null],
  ] as const)('E5 refuses below order.create 4 (%s) with the amount still to collect', async (_name, caps) => {
    const fixture = twoLines(false), order = stored(fixture);
    await db.pos_orders.insert(order);
    await expectInexact(order, fixture.context, caps, effect(fixture));
  });

  it.each([false, true])('E6 a carried sale refused again reopens with the coupon carried once: inclusive = %s', async (pricesIncludeTax) => {
    const fixture = twoLines(pricesIncludeTax), order = stored(fixture);
    await db.pos_orders.insert(order);
    const first = await draft(await reopenRefusedOrder(order.id, deps(fixture.context)));
    const successor: PosOrder = { ...finalizeOrder(restoreOrderDraft(first, { currency, taxContext: fixture.context }).getSnapshot(), { capabilities }),
      syncStatus: 'rejected', error: { code: 'total_mismatch', message: 'x' } };
    expect(successor.coupons![0].carried).toBe(true);
    await db.pos_orders.insert(successor);
    const saved = await draft(await reopenRefusedOrder(successor.id, deps(fixture.context)));
    expectSameFigures(saved, successor);
    expect(saved.totalMinor).toBe(order.totalMinor);
    expect(saved.lineItems.map((line) => line.discounts.map((d) => d.value))).toEqual(first.lineItems.map((line) => line.discounts.map((d) => d.value)));
    expect(saved.coupons).toEqual([expect.objectContaining({ code: 'save', carried: true })]);
  });

  it('E7 withoutCoupons drops the coupons and the total rises by exactly their effect', async () => {
    const fixture = twoLines(false), order = stored(fixture);
    await db.pos_orders.insert(order);
    const saved = await draft(await reopenRefusedOrder(order.id, deps(fixture.context), { withoutCoupons: true }));
    expect(saved.coupons).toBeUndefined();
    expect(saved.totalMinor - order.totalMinor).toBe(effect(fixture));
    expect(effect(fixture)).toBeGreaterThan(0);
  });
});

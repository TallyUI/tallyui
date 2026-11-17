// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { StoreOrder } from '@tallyui/core';
import { updatePayloadErrors } from '@tallyui/core/server';
import { createOrderBuilder } from '../order/order-builder';
import { orderBuilderFromStoreOrder } from '../order/from-store-order';
import type { Order } from '../order/types';
import { sendable } from './command';
import { finalizeOrder } from './finalize';
import { lockedRefundDueMinor, refundDueOf } from './refund-due';

const revision = 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298';
const options = { currency: 'EUR', taxContext: { getTaxRatePpm: () => 100000, pricesIncludeTax: false } };
const capabilities = { orderCreate: 9 };
const GATE_1 = 'finalize: the reopened order carries a store id the store would refuse';
const GATE_3 = 'finalize: the reopened order carries a store id twice';
const LOCKED = 'finalize: a payment the store already holds must be locked, external and carry its store id';
const HELD = 'finalize: the store already holds the new total; remove the payments taken here';
const twoLegs = [{ id: 'p1', method: 'pos_cash', title: 'Cash', amountMinor: 3000 }, { id: 'p2', method: 'stripe', title: 'Card', amountMinor: 1290 }];

/** A store order of 4290: two kept lines, a kept fee and a kept shipping line, paid by `payments`. */
function reopenedCart(payments: StoreOrder['payments'] = [{ id: 'p1', method: 'pos_cash', title: 'Cash', amountMinor: 1000 }]) {
  return orderBuilderFromStoreOrder({
    id: '41', reference: '41', clientOrderId: 'u-1', revision, status: 'completed', placedAt: '2026-11-17T10:00:00.000Z',
    currency: 'EUR', pricesIncludeTax: false, customer: null,
    lines: [
      { id: '7', productId: 'coffee', name: 'Coffee', quantity: 2, subtotalMinor: 2000, totalMinor: 2000, subtotalTaxMinor: 200, taxMinor: 200 },
      { id: '9', productId: 'tea', name: 'Tea', quantity: 1, subtotalMinor: 600, totalMinor: 600, subtotalTaxMinor: 60, taxMinor: 60 },
    ],
    fees: [{ id: 'f1', name: 'Handling', totalMinor: 500, taxMinor: 50, taxStatus: 'taxable' }],
    shipping: [{ id: 's1', name: 'Delivery', totalMinor: 800, taxMinor: 80, taxStatus: 'taxable', methodId: 'flat_rate' }],
    coupons: [], refunds: [], discountMinor: 0, discountTaxMinor: 0, taxLines: [], taxMinor: 390, totalMinor: 4290, payments,
  }, options);
}

/** The T1 cart, fully paid: the store's 1000 plus a till cash leg for the balance. */
function paidCart(): Order {
  const builder = reopenedCart();
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().balanceDueMinor });
  return builder.getSnapshot();
}

/** The two-leg cart with the tea line removed: the store holds 4290 of a 3630 total. */
function overpaidCart() {
  const builder = reopenedCart(twoLegs);
  builder.removeItem(builder.getSnapshot().lineItems[1].id);
  return builder;
}

describe('finalizeOrder on a reopened cart (ADR-090 D7c5)', () => {
  it('finalizes a reopened cart with its store ids, base revision and a zero refund due', () => {
    const builder = reopenedCart();
    builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().balanceDueMinor + 500 });
    const row = finalizeOrder(builder.getSnapshot(), { capabilities });
    expect(row).toMatchObject({ storeOrderId: '41', baseRevision: revision, refundDueMinor: 0 });
    expect(row.baseRevision).toHaveLength(71);
    expect(row.lines.map((line) => line.storeLineId)).toEqual(['7', '9']);
    expect(row.fees!.map((fee) => fee.storeLineId)).toEqual(['f1']);
    expect(row.shipping!.map((charge) => charge.storeLineId)).toEqual(['s1']);
    expect(row.payments).toStrictEqual([
      { id: expect.any(String), storePaymentId: 'p1', method: 'external', amountMinor: 1000, reference: 'pos_cash' },
      { id: expect.any(String), method: 'cash', amountMinor: 3290, tenderedMinor: 3790, changeMinor: 500 },
    ]);
  });

  it('completes an overpaid reopened sale as refund due, with no change leg', () => {
    const snapshot = overpaidCart().getSnapshot();
    const row = finalizeOrder(snapshot, { capabilities });
    expect(row.totalMinor).toBe(3630);
    expect(row.refundDueMinor).toBe(4290 - row.totalMinor);
    expect(row.refundDueMinor).toBe(row.payments.reduce((sum, payment) => sum + payment.amountMinor, 0) - row.totalMinor);
    expect(row.refundDueMinor).toBe(lockedRefundDueMinor(snapshot));
    expect(refundDueOf(row)).toBe(row.refundDueMinor);
    expect(row.payments.map((payment) => payment.reference)).toEqual(['pos_cash', 'stripe']);
    for (const payment of row.payments) expect(payment).not.toHaveProperty('changeMinor');
  });

  it('refuses a till leg once the store already holds the new total', () => {
    const over = overpaidCart();
    over.addPayment({ method: 'cash', amountMinor: 100 });
    expect(() => finalizeOrder(over.getSnapshot(), { capabilities })).toThrow(HELD);
    const exact = reopenedCart(twoLegs);
    expect(exact.getSnapshot().balanceDueMinor).toBe(0);
    exact.addPayment({ method: 'cash', amountMinor: 100 });
    expect(() => finalizeOrder(exact.getSnapshot(), { capabilities })).toThrow(HELD);
  });

  const placements: Record<string, (order: Order, value: string) => Order> = {
    'the store order id': (order, value) => ({ ...order, storeOrder: { ...order.storeOrder!, id: value } }),
    'the revision': (order, value) => ({ ...order, storeOrder: { ...order.storeOrder!, revision: value } }),
    "a line's storeLineId": (order, value) => ({ ...order, lineItems: order.lineItems.map((line, i) => i ? line : { ...line, storeLineId: value }) }),
    "a payment's storePaymentId": (order, value) => ({ ...order, payments: order.payments.map((payment, i) => i ? payment : { ...payment, storePaymentId: value }) }),
  };
  const probes: Array<[string, string]> = [['😀'.repeat(33), 'emoji x33'], ['a\0b', 'NUL'], ['', 'empty']];
  it.each([
    ...['the store order id', "a line's storeLineId", "a payment's storePaymentId"].flatMap((where) => probes.map(([probe, label]) => [where, label, probe])),
    ['the revision', '129 characters', 'a'.repeat(129)], ['the revision', 'NUL', `${revision}\0`],
  ])('gate 1: refuses a store id core would refuse (%s, %s)', (where, _label, probe) => {
    expect(() => finalizeOrder(placements[where](paidCart(), probe), { capabilities })).toThrow(GATE_1);
  });

  it('gate 1: a 64-character id and a 128-character revision pass', () => {
    let order = paidCart();
    for (const where of ['the store order id', "a line's storeLineId", "a payment's storePaymentId"]) order = placements[where](order, 'a'.repeat(64));
    const row = finalizeOrder(placements['the revision'](order, 'b'.repeat(128)), { capabilities });
    expect(row).toMatchObject({ storeOrderId: 'a'.repeat(64), baseRevision: 'b'.repeat(128) });
  });

  it('gate 3: refuses a store id used twice', () => {
    const order = paidCart();
    expect(() => finalizeOrder({ ...order, fees: order.fees!.map((fee) => ({ ...fee, storeLineId: '7' })) }, { capabilities })).toThrow(GATE_3);
    expect(() => finalizeOrder({ ...order, payments: [...order.payments, { ...order.payments[0], id: 'again' }] }, { capabilities })).toThrow(GATE_3);
    expect(finalizeOrder(placements["a line's storeLineId"](order, 'p1'), { capabilities }).lines[0].storeLineId).toBe('p1');
  });

  it("the writer's id rule cannot drift from core's", () => {
    const accepts = (payload: Record<string, unknown>, field: string) => !updatePayloadErrors(payload).some((error) => error.startsWith(`${field}:`));
    for (const probe of ['😀'.repeat(32), '😀'.repeat(33), 'a'.repeat(64), 'a'.repeat(65), 'a\0b', '']) {
      expect(sendable(probe, 64)).toBe(accepts({ orderId: probe, createVersion: 5 }, 'orderId'));
    }
    for (const probe of ['a'.repeat(128), 'a'.repeat(129), 'a\0b']) {
      expect(sendable(probe, 128)).toBe(accepts({ orderId: '41', baseRevision: probe, createVersion: 5 }, 'baseRevision'));
    }
  });

  it('refuses store ids and locked legs on a sale that reopened no store order', () => {
    const message = 'finalize: a store id on a sale that reopened no store order';
    const line = { productId: 'coffee', name: 'Coffee', unitPrice: { amount: 1000, currency: 'EUR' } };
    const kept = createOrderBuilder(options);
    kept.addLine({ ...line, storeLineId: '7' });
    kept.addPayment({ method: 'cash', amountMinor: kept.getSnapshot().totalMinor });
    expect(() => finalizeOrder(kept.getSnapshot())).toThrow(message);
    const locked = createOrderBuilder(options);
    locked.addLine(line);
    locked.addPayment({ method: 'external', amountMinor: locked.getSnapshot().totalMinor, locked: true });
    expect(() => finalizeOrder(locked.getSnapshot())).toThrow(message);
  });

  it('refuses a reopened cart when the store cannot take order.update', () => {
    const message = "finalize: a reopened store order needs the store to accept order.create version 5; update the store's TallyUI plugin";
    const builder = reopenedCart();
    builder.removeFee(builder.getSnapshot().fees![0].id);
    builder.removeShipping(builder.getSnapshot().shipping![0].id);
    builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().balanceDueMinor });
    const order = builder.getSnapshot();
    expect(() => finalizeOrder(order)).toThrow(message);
    for (const orderCreate of [3, 4]) expect(() => finalizeOrder(order, { capabilities: { orderCreate } })).toThrow(message);
    const row = finalizeOrder(order, { capabilities: { orderCreate: 5 } });
    expect(row.display).toBeDefined();
    expect(row.taxByRate).toBeDefined();
  });

  it('refuses a store payment that is not a locked external leg', () => {
    const cash = reopenedCart();
    cash.addPayment({ method: 'cash', amountMinor: cash.getSnapshot().balanceDueMinor, storePaymentId: 'p9', locked: true });
    expect(() => finalizeOrder(cash.getSnapshot(), { capabilities })).toThrow(LOCKED);
    const unnamed = reopenedCart();
    unnamed.addPayment({ method: 'external', amountMinor: unnamed.getSnapshot().balanceDueMinor, locked: true });
    expect(() => finalizeOrder(unnamed.getSnapshot(), { capabilities })).toThrow(LOCKED);
  });
});

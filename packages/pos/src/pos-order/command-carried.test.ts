// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { payloadBoundErrors, payloadShapeErrors, precheckCommand } from '@tallyui/core/server';
import { couponPricingBasis, createOrderBuilder } from '../order/order-builder';
import { toOrderCreateEnvelope, UnsupportedOrderVersionError } from './command';
import { finalizeOrder } from './finalize';
import type { PosOrder } from './types';

const code = 'refused-save';
function sale(carried?: true, orderCreate = 12) {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: {
    pricesIncludeTax: true, getTaxRatePpm: () => 190000,
    rounding: { granularity: 'per_order', mode: 'half_away_from_zero' },
  } });
  const first = builder.addLine({ productId: 'p1', name: 'Inclusive', unitPrice: { amount: 1190, currency: 'EUR', taxInclusive: true } });
  const second = builder.addLine({ productId: 'p2', name: 'Exclusive', unitPrice: { amount: 500, currency: 'EUR', taxInclusive: false } });
  builder.applyLineDiscount(first, { type: 'percentage', value: 10 });
  builder.setCoupons([code], { kind: 'store-priced', ...(carried ? { carried } : {}),
    basis: couponPricingBasis(builder.getSnapshot()),
    priced: new Map([[code, { couponId: 'promo_1', lines: [{ lineId: first, amountMinor: 100 }, { lineId: second, amountMinor: 50 }] }]]) });
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  let nextId = 0;
  return finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate },
    now: new Date('2026-11-21T10:00:00.000Z'), newId: () => `019f6d2e-7800-7000-8000-${String(++nextId).padStart(12, '0')}` });
}
const envelope = (order: PosOrder, maxVersion = 12) => toOrderCreateEnvelope(order, 'device_carried', 1, { maxVersion });

describe('carried store-priced coupons', () => {
  it('C1 folds each share exactly once and passes the server checks', () => {
    const order = sale(true), twin = sale(), sent = envelope(order), plain = envelope(twin);
    const payload = sent.payload, before = plain.payload;
    expect(payload).not.toHaveProperty('coupons');
    expect(payload.display).not.toHaveProperty('coupons');
    expect(JSON.stringify(payload)).not.toContain(code);
    expect(payload.discountMinor).toBe(before.discountMinor! + before.coupons!.reduce((sum, coupon) => sum + coupon.discountMinor, 0));
    for (const [i, line] of payload.lines.entries()) {
      const share = before.coupons!.reduce((sum, coupon) => sum + coupon.lines!.find((entry) => entry.clientLineId === line.clientLineId)!.discountMinor, 0);
      expect(line.discountMinor).toBe((before.lines[i].discountMinor ?? 0) + share);
    }
    expect(payload.subtotalMinor).toBe(before.subtotalMinor);
    expect(payload.taxMinor).toBe(before.taxMinor);
    expect(payload.totalMinor).toBe(before.totalMinor);
    expect(payload.display!.discountMinor).toBe(before.display!.discountMinor);
    expect(payload.display!.orderDiscountMinor).toBe(before.display!.orderDiscountMinor
      + before.display!.coupons!.reduce((sum, row) => sum + row.amountMinor, 0));
    expect(payloadShapeErrors(payload)).toEqual([]);
    expect(payloadBoundErrors(payload)).toEqual([]);
    expect(precheckCommand(sent, { orderCreate: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], register: [1] })).toBeUndefined();
  });

  it('C2 folds only on the wire and preserves the stored coupon and its priced amounts', () => {
    const order = sale(true), before = structuredClone(order), twin = sale();
    const { payload } = envelope(order);
    expect(order).toStrictEqual(before);
    expect(order.display!.coupons).toStrictEqual(twin.display!.coupons);
    expect(order.display!.orderDiscountMinor).toBe(twin.display!.orderDiscountMinor);
    expect(order.coupons![0].carried).toBe(true);
    expect(order.coupons![0].lines!.map(({ lineId, amountMinor }) => ({ lineId, amountMinor }))).toStrictEqual([
      { lineId: order.lines[0].id, amountMinor: 100 }, { lineId: order.lines[1].id, amountMinor: 50 },
    ]);
    expect(payload.lines.reduce((sum, line) => sum + (line.discountMinor ?? 0), 0)).toBe(payload.discountMinor);
  });

  it('C3 needs version 4, without making carried coupons version 6 or 9 content', () => {
    const order = sale(true);
    expect(envelope(order).version).toBe(4);
    expect(envelope(order, 4).version).toBe(4);
    expect(() => envelope(order, 3)).toThrow(UnsupportedOrderVersionError);
    expect(() => envelope(order, 3)).toThrow(expect.objectContaining({ needed: 4, supported: 3 }));
  });

  it('C4 finalizes carried coupons at 4 and 5, while redeemable coupons need 6', () => {
    for (const version of [4, 5]) expect(sale(true, version).coupons![0].carried).toBe(true);
    expect(() => sale(undefined, 5)).toThrow("finalize: coupons need the store to accept order.create version 6; update the store's TallyUI plugin");
    expect(() => sale(true, 3)).toThrow("finalize: a carried coupon needs the store to accept order.create version 4; update the store's TallyUI plugin");
  });

  it('C5 keeps a non-carried envelope byte-identical with every carried and amountMinor key absent', () => {
    const order = sale();
    const stripped = { ...order, coupons: order.coupons!.map(({ carried: _carried, lines, ...coupon }) => ({ ...coupon,
      lines: lines!.map(({ amountMinor: _amount, ...line }) => line) })) };
    expect(order).toStrictEqual(stripped);
    expect(envelope(order)).toStrictEqual(envelope(stripped));
    expect(JSON.stringify(envelope(order))).toBe(JSON.stringify(envelope(stripped)));
  });

  it('refuses a carried coupon with no line shares', () => {
    const order = sale(true);
    const { lines: _lines, ...coupon } = order.coupons![0];
    expect(() => envelope({ ...order, coupons: [coupon] })).toThrow(`Order ${order.id}: a carried coupon has no line shares`);
  });
});

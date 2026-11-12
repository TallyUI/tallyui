// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { payloadShapeErrors } from '@tallyui/core/server';
import { couponPricingBasis, createOrderBuilder, type OrderBuilder } from '../order/order-builder';
import { roundMicrosToMinor, taxMicros } from '../tax/exact';
import { toOrderCreateEnvelope } from './command';
import { finalizeOrder } from './finalize';

const discounts = ['none', 'line-percent', 'line-fixed', 'order-percent'] as const;
type TillDiscount = typeof discounts[number];
const coupons = ['none', 'one-line', 'split', 'two-codes'] as const;
type Coupon = typeof coupons[number];

function sale(pricesIncludeTax: boolean, discount: TillDiscount, secondLine = true) {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: {
    pricesIncludeTax, getTaxRatePpm: () => 190000,
  } });
  const lines = [builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 1190, currency: 'EUR' } })];
  if (secondLine) lines.push(builder.addLine({ productId: 'p2', name: 'Item 2',
    unitPrice: { amount: 595, currency: 'EUR' }, quantity: 2 }));
  if (discount === 'line-percent') builder.applyLineDiscount(lines[0], { type: 'percentage', value: 10 });
  if (discount === 'line-fixed') builder.applyLineDiscount(lines[0], { type: 'fixed', value: 150 });
  if (discount === 'order-percent') builder.applyOrderDiscount({ type: 'percentage', value: 5 });
  return { builder, lines };
}

function priceCoupons(builder: OrderBuilder, lines: string[], coupon: Coupon) {
  const priced = new Map<string, { couponId: string; lines: { lineId: string; amountMinor: number }[] }>();
  if (coupon !== 'none') priced.set('save', { couponId: 'promo_1', lines: [
    { lineId: lines[0], amountMinor: coupon === 'one-line' ? 100 : 60 },
    ...(coupon === 'split' ? [{ lineId: lines[1], amountMinor: 40 }] : []),
  ] });
  if (coupon === 'two-codes') priced.set('extra', { couponId: 'promo_2', lines: [{ lineId: lines[0], amountMinor: 40 }] });
  builder.setCoupons([...priced.keys()], { kind: 'store-priced', basis: couponPricingBasis(builder.getSnapshot()), priced });
}

function envelope(builder: OrderBuilder) {
  let nextId = 0;
  const order = finalizeOrder(builder.getSnapshot(), {
    now: new Date('2026-10-07T10:00:00.000Z'), newId: () => `019f6d2e-7800-7000-8000-${String(++nextId).padStart(12, '0')}`,
    capabilities: { orderCreate: 6 },
  });
  return toOrderCreateEnvelope(order, 'dev', 1, { maxVersion: 6 });
}

function paidEnvelope(builder: OrderBuilder) {
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  return envelope(builder);
}

function wooSale() {
  const builder = createOrderBuilder({ currency: 'GBP', taxContext: {
    pricesIncludeTax: true, rounding: { granularity: 'woocommerce', roundAtSubtotal: false }, getTaxRatePpm: () => 200000,
    getTaxRates: () => [{ id: 1, code: 'VAT', label: 'VAT', rate: '20.0000', priority: 1, compound: false, shipping: true }],
  }, couponContext: {
    configs: new Map([['ten', { discount_type: 'percent', amount: '10', limit_usage_to_x_items: null,
      product_ids: [], excluded_product_ids: [], product_categories: [], excluded_product_categories: [], exclude_sale_items: false }]]),
    couponIds: new Map([['ten', '303']]), productCategories: new Map(), calcDiscountsSequentially: false,
  } });
  const line = builder.addLine({ productId: '1', name: 'Item', unitPrice: { amount: 800, currency: 'GBP' }, regularUnitPriceMinor: 1000 });
  builder.addLine({ productId: '2', name: 'Item 2', unitPrice: { amount: 500, currency: 'GBP' }, regularUnitPriceMinor: 500 });
  builder.applyLineDiscount(line, { type: 'percentage', value: 10 });
  builder.setCoupons(['ten']);
  return builder;
}

// Measured on base 0b68fe6d624799dc4893c7e43d8564eb788842c0, before changing command.ts.
const expected = {
  inclusive: { none: [0, 0], 'line-percent': [100, 0], 'line-fixed': [126, 0], 'order-percent': [50, 50] },
  exclusive: { none: [0, 0], 'line-percent': [119, 0], 'line-fixed': [150, 0], 'order-percent': [60, 59] },
};

describe('net line discounts with store-priced coupons (#786)', () => {
  it('sends the pre-coupon net discount and keeps the coupon and settlement figures', () => {
    const { builder, lines } = sale(true, 'line-percent', false);
    priceCoupons(builder, lines, 'one-line');
    const payload = paidEnvelope(builder).payload;
    expect(payload.lines[0].discountMinor).toBe(100);
    expect(payload.coupons).toEqual([{ code: 'save', couponId: 'promo_1', discountMinor: 84, discountTaxMinor: 16 }]);
    expect(payload).toMatchObject({ subtotalMinor: 816, taxMinor: 155, totalMinor: 971, discountMinor: 100 });
  });

  it('still sends 100 without the coupon', () => {
    expect(paidEnvelope(sale(true, 'line-percent', false).builder).payload.lines[0].discountMinor).toBe(100);
  });

  it.each(['none', 'one-line'] as const)('omits the line discount key without a till discount, coupon %s', (coupon) => {
    const { builder, lines } = sale(true, 'none', false);
    priceCoupons(builder, lines, coupon);
    expect(paidEnvelope(builder).payload.lines[0]).not.toHaveProperty('discountMinor');
  });

  describe.each([
    { mode: 'inclusive', pricesIncludeTax: true },
    { mode: 'exclusive', pricesIncludeTax: false },
  ] as const)('$mode', ({ mode, pricesIncludeTax }) => {
    describe.each(discounts)('%s', (discount) => {
      it.each(coupons)('reconciles the payload with coupon %s', (coupon) => {
        const { builder, lines } = sale(pricesIncludeTax, discount);
        priceCoupons(builder, lines, coupon);
        const payload = paidEnvelope(builder).payload;
        const netAfterTill = payload.lines.reduce((sum, line) => {
          const amount = line.unitPriceMinor * line.quantity;
          const netA = pricesIncludeTax ? amount - roundMicrosToMinor(taxMicros(amount, 190000, true)) : amount;
          return sum + netA - (line.discountMinor ?? 0);
        }, 0);
        const couponMinor = (payload.coupons ?? []).reduce((sum, row) => sum + row.discountMinor, 0);
        expect(Math.abs(netAfterTill - couponMinor - payload.subtotalMinor)).toBeLessThanOrEqual(pricesIncludeTax ? 2 : 0);
        expect(payload.subtotalMinor + payload.taxMinor).toBe(payload.totalMinor);
        expect(payload.totalMinor).toBe(payload.payments.reduce((sum, row) => sum + row.amountMinor, 0));
        expect(payloadShapeErrors(payload)).toEqual([]);
        if (coupon === 'none') expect(payload.lines.map((line) => line.discountMinor ?? 0)).toEqual(expected[mode][discount]);
      });

      it('keeps the full envelope when the coupon column is removed', () => {
        const { builder, lines } = sale(pricesIncludeTax, discount);
        const withoutCouponColumn = paidEnvelope(builder);
        priceCoupons(builder, lines, 'none');
        expect(envelope(builder)).toEqual(withoutCouponColumn);
        expect(withoutCouponColumn.payload.lines.map((line) => line.discountMinor ?? 0)).toEqual(expected[mode][discount]);
      });
    });
  });

  it('keeps the WooCommerce-inclusive coupon sale line discounts from the base commit', () => {
    expect(paidEnvelope(wooSale()).payload.lines.map((line) => line.discountMinor ?? 0)).toEqual([55, 0]);
  });
});

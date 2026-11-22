import { describe, expect, it } from 'vitest';
import type { woocommerceCoupons } from '@tallyui/core';
import type { TaxContext, WooRate } from '../tax/types';
import { createOrderBuilder, type OrderCouponContext } from './order-builder';
import { restoreOrderDraft } from './order-drafts';
import type { AddLineInput, Order } from './types';

// Row 498: a Woo coupon replayed over a held line re-prices at that line's parked rates, so the total never moves under taken money.
// Copied from order-drafts-held-rates.test.ts:10-11 (`rate`).
const rate = (id: number, percent: string, compound = false): WooRate =>
  ({ id, code: `rate-${id}`, label: `Rate ${id}`, rate: percent, priority: id, compound, shipping: true });
// Copied from order-drafts-held-rates.test.ts:13-17 (`woo`).
const woo = (rates: WooRate[], pricesIncludeTax = false): TaxContext => ({
  pricesIncludeTax, rounding: { granularity: 'woocommerce', roundAtSubtotal: false }, shippingTaxClass: 'reduced',
  getTaxRatePpm: () => { throw new Error('WooCommerce must use the rate list'); },
  getTaxRates: (taxClass) => taxClass === 'reduced' ? rates : [],
});
// Copied from order-drafts-held-rates.test.ts:19 (`captured`).
const captured = { method: 'cash', amountMinor: 500, reference: 'Cash', status: 'captured' } as const;
// Copied from order-drafts-held-rates.test.ts:110-113 (`ten`, `couponContext`).
const ten: woocommerceCoupons.CouponDiscountConfig = { discount_type: 'percent', amount: '10', limit_usage_to_x_items: null, product_ids: [],
  excluded_product_ids: [], product_categories: [], excluded_product_categories: [], exclude_sale_items: false };
const couponContext: OrderCouponContext = { configs: new Map([['ten', ten]]), couponIds: new Map([['ten', '303']]),
  productCategories: new Map(), calcDiscountsSequentially: false };

const figures = (order: Order) => ({ taxMinor: order.taxMinor, totalMinor: order.totalMinor });
const coupons = (order: Order) => (order.coupons ?? []).map(({ discountMinor, discountTaxMinor }) => ({ discountMinor, discountTaxMinor }));
// LineItem carries no taxMinor (types.ts:127): its tax is taxMicros.
const lineFigures = (order: Order) => order.lineItems.map(({ netMicros, taxMicros }) => ({ netMicros, taxMicros }));

const parkedTen = { legIds: ['leg-1'], taxLines: new Map([['l1', [{ code: 'rate-1', rateId: 1, compound: false, ratePpm: 100000, taxMicros: '0' }]]]) };

function build(rates: WooRate[], inclusive: boolean, priceMinor: number, heldRates?: typeof parkedTen, extraLine?: AddLineInput) {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: woo(rates, inclusive), ...(heldRates ? { heldRates } : {}) });
  builder.addLine({ id: 'l1', productId: 'p1', name: 'Tea', taxClass: 'reduced', unitPrice: { amount: priceMinor, currency: 'EUR' } });
  if (extraLine) builder.addLine(extraLine);
  builder.addPayment({ id: 'leg-1', ...captured });
  builder.setCoupons(['ten'], couponContext);
  return builder;
}
const held = (rates: WooRate[], inclusive: boolean, priceMinor: number, extraLine?: AddLineInput) =>
  build(rates, inclusive, priceMinor, parkedTen, extraLine);
const plain = (rates: WooRate[], inclusive: boolean, priceMinor: number) => build(rates, inclusive, priceMinor);
const voided = (builder: ReturnType<typeof build>) => {
  // As order-drafts-held-rates.test.ts:31-34 (`voidLeg`) does.
  expect(builder.setPaymentStatus('leg-1', 'voided')).toBe(true);
  return builder.getSnapshot();
};

describe('a replayed Woo coupon over a held line re-prices at the parked rates (row 498)', () => {
  it('R1: inclusive, the total holds', () => {
    const order = held([rate(1, '20.0000')], true, 1100).getSnapshot();
    const parked = plain([rate(1, '10.0000')], true, 1100).getSnapshot();
    expect(figures(order)).toEqual({ taxMinor: 90, totalMinor: 990 });
    expect(figures(parked)).toEqual({ taxMinor: 90, totalMinor: 990 });
    expect(coupons(order)).toEqual([{ discountMinor: 100, discountTaxMinor: 10 }]);
    expect(coupons(parked)).toEqual([{ discountMinor: 100, discountTaxMinor: 10 }]);
    expect(lineFigures(order)).toEqual(lineFigures(parked));
    expect(lineFigures(order).map((li) => li.taxMicros)).toEqual(['90000000']);
  });

  it('R2: exclusive, the coupon\'s tax holds', () => {
    const order = held([rate(1, '20.0000')], false, 1000).getSnapshot();
    const parked = plain([rate(1, '10.0000')], false, 1000).getSnapshot();
    expect(figures(order)).toEqual({ taxMinor: 90, totalMinor: 990 });
    expect(coupons(order)).toEqual([{ discountMinor: 100, discountTaxMinor: 10 }]);
    expect(coupons(parked)).toEqual([{ discountMinor: 100, discountTaxMinor: 10 }]);
  });

  it('R3: a held line beside a fresh line of the same class keeps its own rate (exclusive)', () => {
    const order = held([rate(1, '20.0000')], false, 1000,
      { id: 'l2', productId: 'p2', name: 'Cake', taxClass: 'reduced', unitPrice: { amount: 1000, currency: 'EUR' } }).getSnapshot();
    // 10 from l1 at the parked 10%, plus 20 from l2 at today's 20%.
    expect(coupons(order).map((c) => c.discountTaxMinor)).toEqual([30]);
    expect(order.lineItems.map((li) => li.taxMicros)).toEqual(['90000000', '180000000']);
  });

  it('R4: a void ends the hold for the coupon too (inclusive)', () => {
    const order = voided(held([rate(1, '20.0000')], true, 1100));
    const fresh = voided(plain([rate(1, '20.0000')], true, 1100));
    expect(figures(order)).toEqual(figures(fresh));
    expect(coupons(order)).toEqual(coupons(fresh));
  });

  it('R5: resume with a locked captured leg keeps the parked coupon figures and nothing is due', () => {
    const parking = createOrderBuilder({ currency: 'EUR', taxContext: woo([rate(1, '10.0000')], true) });
    parking.addLine({ productId: 'p1', name: 'Tea', taxClass: 'reduced', unitPrice: { amount: 1100, currency: 'EUR' } });
    parking.setCoupons(['ten'], couponContext);
    parking.addPayment({ ...captured, amountMinor: 990, locked: true });
    const saved = JSON.parse(JSON.stringify(parking.getSnapshot())) as Order;
    expect(saved.balanceDueMinor).toBe(0);
    // As use-sale.ts:1089-1091 resumes when every captured leg is locked: keep is false, keepTaxRates true.
    const builder = restoreOrderDraft(saved, { currency: 'EUR', taxContext: woo([rate(1, '20.0000')], true), keepTaxRates: true, keepCoupons: false });
    // restoreOrderDraft does not re-apply redeemable coupons (order-drafts.ts:167); the sale does, as here.
    builder.setCoupons(['ten'], couponContext);
    const restored = builder.getSnapshot();
    expect({ ...figures(restored), balanceDueMinor: restored.balanceDueMinor })
      .toEqual({ ...figures(saved), balanceDueMinor: saved.balanceDueMinor });
    expect(coupons(restored)).toEqual(coupons(saved));
    expect(restored.balanceDueMinor).toBe(0);
  });
});

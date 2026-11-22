import { describe, expect, it } from 'vitest';
import type { woocommerceCoupons } from '@tallyui/core';
import type { TaxContext, WooRate } from '../tax/types';
import { createOrderBuilder, type OrderBuilder, type OrderCouponContext } from './order-builder';
import { restoreOrderDraft } from './order-drafts';
import { capturedMinor } from '../tender/payment-legs';
import type { Order, Payment } from './types';

// Row 497: a paid draft keeps its parked tax rates for Woo lines, and for fees and shipping in every granularity.
const rate = (id: number, percent: string, compound = false): WooRate =>
  ({ id, code: `rate-${id}`, label: `Rate ${id}`, rate: percent, priority: id, compound, shipping: true });
// Copied from order-drafts-rederive.test.ts (RD6 `woo`, `at`), with a shipping class so shipping takes the class's rates.
const woo = (rates: WooRate[], pricesIncludeTax = false): TaxContext => ({
  pricesIncludeTax, rounding: { granularity: 'woocommerce', roundAtSubtotal: false }, shippingTaxClass: 'reduced',
  getTaxRatePpm: () => { throw new Error('WooCommerce must use the rate list'); },
  getTaxRates: (taxClass) => taxClass === 'reduced' ? rates : [],
});
const at = (ratePpm: number): TaxContext => ({ pricesIncludeTax: false, getTaxRatePpm: (taxClass) => taxClass === 'reduced' ? ratePpm : 0 });
const captured = { method: 'cash', amountMinor: 500, reference: 'Cash', status: 'captured' } as const;

function park(taxContext: TaxContext, paid: boolean, extra: { locked?: true } = {}, amounts = [1000, 500, 300]): Order {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext });
  builder.addLine({ productId: 'p1', name: 'Tea', taxClass: 'reduced', unitPrice: { amount: amounts[0], currency: 'EUR' }, quantity: 2 });
  builder.addFee({ name: 'Fee', amountMinor: amounts[1], taxClass: 'reduced' });
  builder.addShipping({ name: 'Post', amountMinor: amounts[2], taxClass: 'reduced' });
  if (paid) builder.addPayment({ ...captured, ...extra });
  return JSON.parse(JSON.stringify(builder.getSnapshot())) as Order;
}
const items = (order: Order) => [...order.lineItems, ...order.fees ?? [], ...order.shipping ?? []];
const rates = (order: Order) => items(order).map((item) => item.taxLines.map((t) => t.ratePpm));
const figures = (order: Order) => ({ taxMinor: order.taxMinor, totalMinor: order.totalMinor });
const voidLeg = (builder: OrderBuilder) => {
  expect(builder.setPaymentStatus(builder.getSnapshot().payments[0].id, 'voided')).toBe(true);
  return builder.getSnapshot();
};

describe('restoreOrderDraft holds a paid draft\'s parked rates (row 497)', () => {
  it('H1: Woo held: line, fee and shipping keep 10% under a 20% context', () => {
    const saved = park(woo([rate(1, '10.0000')]), true);
    expect(rates(saved)).toEqual([[100000], [100000], [100000]]);
    const restored = restoreOrderDraft(saved, { currency: 'EUR', taxContext: woo([rate(1, '20.0000')]), keepTaxRates: true }).getSnapshot();
    expect(rates(restored)).toEqual([[100000], [100000], [100000]]);
    expect(figures(restored)).toEqual(figures(saved));
  });

  it('H2: Woo unpaid: all three take 20%', () => {
    const restored = restoreOrderDraft(park(woo([rate(1, '10.0000')]), false), { currency: 'EUR', taxContext: woo([rate(1, '20.0000')]), keepTaxRates: false }).getSnapshot();
    expect(rates(restored)).toEqual([[200000], [200000], [200000]]);
  });

  it('H3: Woo void: the next build takes 20%, with H2\'s totals', () => {
    const builder = restoreOrderDraft(park(woo([rate(1, '10.0000')]), true), { currency: 'EUR', taxContext: woo([rate(1, '20.0000')]), keepTaxRates: true });
    const voided = voidLeg(builder);
    expect(rates(voided)).toEqual([[200000], [200000], [200000]]);
    const unpaid = restoreOrderDraft(park(woo([rate(1, '10.0000')]), false), { currency: 'EUR', taxContext: woo([rate(1, '20.0000')]) }).getSnapshot();
    expect(figures(voided)).toEqual(figures(unpaid));
  });

  it.each([{ inclusive: true }, { inclusive: false }])('H4: Woo exact replay with two rates, one compound (inclusive $inclusive)', ({ inclusive }) => {
    const saved = park(woo([rate(1, '8.8750'), rate(2, '2.0000', true)], inclusive), true, {}, [1999, 777, 499]);
    expect(items(saved).every((item) => item.taxLines.length === 2)).toBe(true);
    const restored = restoreOrderDraft(saved, { currency: 'EUR', taxContext: woo([rate(1, '10.0000'), rate(2, '5.0000', true)], inclusive), keepTaxRates: true }).getSnapshot();
    const exact = (order: Order) => items(order).map(({ taxLines, netMinor, totalMinor, taxMicros }) => ({ netMinor, totalMinor, taxMicros,
      taxLines: taxLines.map(({ rateId, compound, ratePpm, taxMicros: micros }) => ({ rateId, compound, ratePpm, taxMicros: micros })) }));
    expect(exact(restored)).toEqual(exact(saved));
    expect(figures(restored)).toEqual(figures(saved));
  });

  it('H5: generic held: fee and shipping keep 10% under a 20% context', () => {
    const saved = park(at(100000), true);
    const restored = restoreOrderDraft(saved, { currency: 'EUR', taxContext: at(200000), keepTaxRates: true }).getSnapshot();
    expect(rates(restored).slice(1)).toEqual([[100000], [100000]]);
    expect(figures(restored)).toEqual(figures(saved));
  });

  it('H6: generic void: fee and shipping take 20%', () => {
    const builder = restoreOrderDraft(park(at(100000), true), { currency: 'EUR', taxContext: at(200000), keepTaxRates: true });
    expect(rates(voidLeg(builder)).slice(1)).toEqual([[200000], [200000]]);
  });

  it('H7: a locked captured leg still holds', () => {
    const saved = park(woo([rate(1, '10.0000')]), true, { locked: true });
    expect(saved.payments[0].locked).toBe(true);
    const restored = restoreOrderDraft(saved, { currency: 'EUR', taxContext: woo([rate(1, '20.0000')]), keepTaxRates: true }).getSnapshot();
    expect(rates(restored)).toEqual([[100000], [100000], [100000]]);
  });

  // couponContext copied from woocommerce-coupons.test.ts:28, with only the 'ten' coupon.
  const ten: woocommerceCoupons.CouponDiscountConfig = { discount_type: 'percent', amount: '10', limit_usage_to_x_items: null, product_ids: [],
    excluded_product_ids: [], product_categories: [], excluded_product_categories: [], exclude_sale_items: false };
  const couponContext: OrderCouponContext = { configs: new Map([['ten', ten]]), couponIds: new Map([['ten', '303']]),
    productCategories: new Map(), calcDiscountsSequentially: false };
  const replayed = (heldRates?: Parameters<typeof createOrderBuilder>[0]['heldRates']) => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: woo([rate(1, '20.0000')]), ...(heldRates ? { heldRates } : {}) });
    builder.addLine({ id: 'l1', productId: 'p1', name: 'Tea', taxClass: 'reduced', unitPrice: { amount: 1000, currency: 'EUR' } });
    builder.addPayment({ id: 'leg-1', ...captured });
    builder.setCoupons(['ten'], couponContext);
    return builder.getSnapshot();
  };

  it('H8 (desk A): a fresh Woo coupon replay over a held line keeps the parked rate', () => {
    const order = replayed({ legIds: ['leg-1'], taxLines: new Map([['l1', [{ code: 'rate-1', rateId: 1, compound: false, ratePpm: 100000, taxMicros: '0' }]]]) });
    expect(figures(order)).toEqual({ taxMinor: 90, totalMinor: 990 });
    expect(rates(order)).toEqual([[100000]]);
  });

  it('H8b: the same replay with no heldRates takes today\'s rate', () => {
    expect(figures(replayed())).toEqual({ taxMinor: 180, totalMinor: 1080 });
  });

  it('H9: a builder without heldRates is unchanged by an unrelated build', () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: woo([rate(1, '10.0000')]) });
    builder.addFee({ name: 'Fee', amountMinor: 500, taxClass: 'reduced' });
    const { note: _n, updatedAt: _u, ...before } = builder.getSnapshot();
    builder.setNote('unrelated');
    const { note: _n2, updatedAt: _u2, ...after } = builder.getSnapshot();
    expect(after).toEqual(before);
  });
});

// Desk guards for moving payments ahead of lines in restoreOrderDraft: these restore exactly as at 61cbdb83.
describe('restoreOrderDraft without a captured leg restores as before (row 497 guards)', () => {
  const legs: Payment[] = [{ id: 'leg-p', method: 'card', amountMinor: 400, reference: 'Card', status: 'pending' },
    { id: 'leg-a', method: 'card', amountMinor: 600, reference: 'Card', status: 'authorized' }];
  const parked = (payments: Payment[]): Order => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: woo([rate(1, '10.0000')]) });
    builder.addLine({ id: 'l1', productId: 'p1', name: 'Tea', taxClass: 'reduced', unitPrice: { amount: 1000, currency: 'EUR' }, quantity: 2 });
    builder.addFee({ id: 'f1', name: 'Fee', amountMinor: 500, taxClass: 'reduced' });
    builder.addShipping({ id: 's1', name: 'Post', amountMinor: 300, taxClass: 'reduced' });
    for (const payment of payments) builder.addPayment(payment);
    return JSON.parse(JSON.stringify(builder.getSnapshot())) as Order;
  };
  const pinned = (order: Order) => ({ payments: order.payments, fees: order.fees, shipping: order.shipping,
    lineItems: order.lineItems.map(({ id, taxLines, netMinor, totalMinor }) => ({ id, taxLines, netMinor, totalMinor })),
    taxMinor: order.taxMinor, totalMinor: order.totalMinor, balanceDueMinor: order.balanceDueMinor });

  // Hand-checked: 20% of 2000, 500 and 300 is 400, 100 and 60; pending and authorized legs pay nothing, so 3360 is still due.
  const tax = (ratePpm: number, taxMicros: string) => [{ code: 'rate-1', rateId: 1, compound: false, ratePpm, taxMicros }];
  const charge = (id: string, name: string, amountMinor: number, taxMicros: string, totalMinor: number) => ({ id, name, amountMinor,
    taxClass: 'reduced', taxStatus: 'taxable', netMicros: `${amountMinor}000000`, netMinor: amountMinor, taxLines: tax(200000, taxMicros), taxMicros, totalMinor });
  const at20 = (payments: Payment[]) => ({ payments, fees: [charge('f1', 'Fee', 500, '100000000', 600)],
    shipping: [charge('s1', 'Post', 300, '60000000', 360)], lineItems: [{ id: 'l1', taxLines: tax(200000, '400000000'), netMinor: 2000, totalMinor: 2400 }],
    taxMinor: 560, totalMinor: 3360, balanceDueMinor: 3360 });

  it('G1: an unpaid Woo draft restores at today\'s rate, field for field', () => {
    const restored = restoreOrderDraft(parked([]), { currency: 'EUR', taxContext: woo([rate(1, '20.0000')]), keepTaxRates: false }).getSnapshot();
    expect(pinned(restored)).toEqual(at20([]));
  });

  it('G2: a draft with only pending and authorized legs restores as the sale resumes it, field for field', () => {
    const saved = parked(legs);
    // As use-sale.ts resume: `keep` is false with no coupons, so keepTaxRates is the captured test alone.
    const restored = restoreOrderDraft(saved, { currency: 'EUR', taxContext: woo([rate(1, '20.0000')]), keepTaxRates: capturedMinor(saved.payments) !== 0 }).getSnapshot();
    expect(pinned(restored)).toEqual(at20(legs));
  });
});

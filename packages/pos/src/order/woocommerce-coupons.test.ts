import { describe, expect, it, vi } from 'vitest';
import { woocommerceCoupons } from '@tallyui/core';
import type { TaxContext, WooRate } from '../tax/types';
import { createOrderBuilder, type OrderCouponContext } from './order-builder';
import { restoreOrderDraft, writeOrderDraft } from './order-drafts';
import type { Order } from './types';

const rate = (id: number, percent: string, extra: Partial<WooRate> = {}): WooRate => ({
  id, code: `rate-${id}`, label: `Rate ${id}`, rate: percent, priority: id, compound: false, shipping: true, ...extra,
});
function context(rates: Record<string, WooRate[]>, pricesIncludeTax = false, roundAtSubtotal = false): TaxContext {
  return {
    pricesIncludeTax, rounding: { granularity: 'woocommerce', roundAtSubtotal },
    getTaxRatePpm: () => { throw new Error('WooCommerce must use the rate list'); },
    getTaxRates: (taxClass, options) => (rates[taxClass || 'standard'] ?? []).filter((rate) => !options?.shipping || rate.shipping),
  };
}
function config(discount_type: woocommerceCoupons.CouponDiscountConfig['discount_type'], amount: string,
  extra: Partial<woocommerceCoupons.CouponDiscountConfig> = {}): woocommerceCoupons.CouponDiscountConfig {
  return { discount_type, amount, limit_usage_to_x_items: null, product_ids: [], excluded_product_ids: [],
    product_categories: [], excluded_product_categories: [], exclude_sale_items: false, ...extra };
}
const configs = new Map([
  ['fixed3', config('fixed_cart', '3')], ['fixed1', config('fixed_cart', '1')],
  ['ten', config('percent', '10')], ['ten-a', config('percent', '10')], ['ten-b', config('percent', '10')],
  ['no-sale', config('percent', '10', { exclude_sale_items: true })],
]);
const couponContext: OrderCouponContext = { configs,
  couponIds: new Map([['fixed3', '301'], ['fixed1', '302'], ['ten', '303'], ['ten-a', '304'], ['ten-b', '305'], ['no-sale', '306']]),
  productCategories: new Map(), calcDiscountsSequentially: false };
const compoundRates = [rate(1, '5.0000', { compound: true, priority: 2 }), rate(2, '10.0000', { priority: 1 })];
function make(rates = [rate(1, '20.0000')], inclusive = false, subtotal = false, sequential = false) {
  return createOrderBuilder({ currency: 'GBP', taxContext: context({ standard: rates }, inclusive, subtotal),
    couponContext: { ...couponContext, calcDiscountsSequentially: sequential } });
}
function add(builder: ReturnType<typeof make>, amount: number, productId = 'p', quantity = 1, taxClass?: string) {
  return builder.addLine({ productId, name: productId, unitPrice: { amount, currency: builder.getSnapshot().currency }, quantity, taxClass });
}
function displayIdentity(order: Order) {
  const d = order.display;
  expect(d.lines.reduce((sum, line) => sum + line.amountMinor, 0)).toBe(d.subtotalMinor);
  expect(d.subtotalMinor - d.discountMinor + [...(d.fees ?? []), ...(d.shipping ?? [])].reduce((sum, row) => sum + row.amountMinor, 0)
    + (d.taxInclusive ? 0 : d.taxMinor)).toBe(order.totalMinor);
}
function fixedCart() {
  const builder = make();
  add(builder, 1000, 'p1');
  add(builder, 500, 'p2');
  return builder;
}
function crossCheck(order: Order, input: woocommerceCoupons.RecalculateInput, checkDiscountTotals = true) {
  const result = woocommerceCoupons.recalculateCoupons(input);
  expect(result.couponLines.map((coupon) => ({ code: coupon.code,
    discountMinor: Math.round(Number(coupon.discount) * 100),
    discountTaxMinor: Math.round(Number(coupon.discount_tax) * 100) }))).toEqual(order.coupons!.map(({ couponId: _couponId, ...row }) => row));
  const totals = woocommerceCoupons.calculateOrderTotals({ ...result, shippingLines: [], feeLines: [],
    taxRates: input.taxRates, taxRoundAtSubtotal: input.taxRoundAtSubtotal, dp: input.dp, pricesIncludeTax: input.pricesIncludeTax });
  if (checkDiscountTotals) {
    expect(Math.round(Number(totals.discount_total) * 100)).toBe(order.coupons!.reduce((sum, row) => sum + row.discountMinor, 0));
    expect(Math.round(Number(totals.discount_tax) * 100)).toBe(order.coupons!.reduce((sum, row) => sum + row.discountTaxMinor, 0));
  }
  expect(Math.round(Number(totals.total) * 100)).toBe(order.totalMinor);
  expect(Math.round(Number(totals.total_tax) * 100)).toBe(order.taxMinor);
}

describe('WooCommerce coupons in the order builder', () => {
  it.each([false, true])('applies a fixed cart coupon, exclusive, roundAtSubtotal=%s', (roundAtSubtotal) => {
    const builder = make(undefined, false, roundAtSubtotal);
    add(builder, 1000, 'p1');
    add(builder, 500, 'p2');
    const before = builder.getSnapshot();
    builder.setCoupons(['fixed3']);
    const order = builder.getSnapshot();
    expect(order.coupons).toEqual([{ code: 'fixed3', couponId: '301', discountMinor: 300, discountTaxMinor: 60 }]);
    expect(order.lineItems.map((line) => line.netMinor)).toEqual([850, 350]);
    expect(order).toMatchObject({ subtotalMinor: 1200, taxMinor: 240, totalMinor: 1440, discountMinor: 0 });
    expect(order.display.coupons).toEqual([{ code: 'fixed3', amountMinor: 300 }]);
    expect(order.display).toMatchObject({ discountMinor: 300, subtotalMinor: 1500 });
    expect(order.display.lines).toEqual(before.display.lines);
    expect(order.display.lines.map((line) => line.amountMinor)).toEqual([1000, 500]);
    displayIdentity(order);
    crossCheck(order, {
      lineItems: [
        { product_id: 0, quantity: 1, tax_class: '', subtotal: '10.000000', total: '10.000000',
          subtotal_tax: '2.000000', total_tax: '2.000000', taxes: [{ id: 1, subtotal: '2.000000', total: '2.000000' }] },
        { product_id: 0, quantity: 1, tax_class: '', subtotal: '5.000000', total: '5.000000',
          subtotal_tax: '1.000000', total_tax: '1.000000', taxes: [{ id: 1, subtotal: '1.000000', total: '1.000000' }] },
      ],
      couponLines: [{ code: 'fixed3' }], couponConfigs: new Map([['fixed3', config('fixed_cart', '3')]]),
      taxRates: [{ id: 1, rate: '20.0000', compound: false, order: 1, priority: 1, class: 'standard' }],
      productCategories: new Map(), calcDiscountsSequentially: false, pricesIncludeTax: false,
      taxRoundAtSubtotal: roundAtSubtotal, dp: 2,
    }, !roundAtSubtotal);
  });

  it('uses the amount after a manual cut as the coupon base', () => {
    const builder = make([rate(1, '0.0000')]);
    const id = add(builder, 1800, 'p1');
    builder.applyLineDiscount(id, { type: 'fixed', value: 200 });
    const before = builder.getSnapshot();
    builder.setCoupons(['ten']);
    const order = builder.getSnapshot();
    expect(order.coupons).toEqual([{ code: 'ten', couponId: '303', discountMinor: 160, discountTaxMinor: 0 }]);
    expect(order.totalMinor).toBe(1440);
    expect(order.display).toMatchObject({ discountMinor: 360, subtotalMinor: 1800 });
    expect(order.display.lines).toEqual(before.display.lines);
    expect(order.lineItems[0].discounts).toEqual(before.lineItems[0].discounts);
    expect(order.discountMinor).toBe(200);
    displayIdentity(order);
  });

  it.each([
    { sequential: false, discounts: [1000, 1000], totalMinor: 8000 },
    { sequential: true, discounts: [1000, 900], totalMinor: 8100 },
  ])('uses sequential=$sequential for two percentage coupons', ({ sequential, discounts, totalMinor }) => {
    const builder = make([rate(1, '0.0000')], false, false, sequential);
    add(builder, 10000);
    builder.setCoupons(['ten-a', 'ten-b']);
    const order = builder.getSnapshot();
    expect(order.coupons!.map((row) => row.discountMinor)).toEqual(discounts);
    expect(order.coupons!.map((row) => row.code)).toEqual(['ten-a', 'ten-b']);
    expect(order.totalMinor).toBe(totalMinor);
    displayIdentity(order);
  });

  it('preserves non-default priorities for an inclusive compound rate', () => {
    const builder = make(compoundRates, true);
    add(builder, 11550, 'p1');
    expect(builder.getSnapshot().lineItems[0]).toMatchObject({ netMinor: 10000, totalMinor: 11550 });
    builder.setCoupons(['ten']);
    const order = builder.getSnapshot();
    expect(order.coupons).toEqual([{ code: 'ten', couponId: '303', discountMinor: 1000, discountTaxMinor: 155 }]);
    expect(order.lineItems[0].netMinor).toBe(9000);
    expect(order.lineItems[0].taxLines.find((tax) => tax.rateId === 1)!.taxMicros).toBe('495000000');
    expect(order.lineItems[0].taxLines.find((tax) => tax.rateId === 2)!.taxMicros).toBe('900000000');
    expect(order).toMatchObject({ taxMinor: 1395, totalMinor: 10395 });
    expect(order.display.coupons).toEqual([{ code: 'ten', amountMinor: 1155 }]);
    expect(order.display.subtotalMinor).toBe(11550);
    displayIdentity(order);
    crossCheck(order, {
      lineItems: [{ product_id: 0, quantity: 1, tax_class: '', subtotal: '100.000000', total: '100.000000',
        subtotal_tax: '15.500000', total_tax: '15.500000', taxes: [
          { id: 2, subtotal: '10.000000', total: '10.000000' }, { id: 1, subtotal: '5.500000', total: '5.500000' },
        ] }],
      couponLines: [{ code: 'ten' }], couponConfigs: new Map([['ten', config('percent', '10')]]),
      taxRates: [
        { id: 1, rate: '5.0000', compound: true, order: 2, priority: 2, class: 'standard' },
        { id: 2, rate: '10.0000', compound: false, order: 1, priority: 1, class: 'standard' },
      ],
      productCategories: new Map(), calcDiscountsSequentially: false, pricesIncludeTax: true, taxRoundAtSubtotal: false, dp: 2,
    });
  });

  it('keeps the display identity and engine totals for odd inclusive figures', () => {
    const builder = make(undefined, true);
    add(builder, 333, 'p1');
    add(builder, 333, 'p2');
    add(builder, 333, 'p3');
    builder.setCoupons(['fixed1']);
    const order = builder.getSnapshot();
    displayIdentity(order);
    expect(order.display.coupons![0].amountMinor).toBe(order.coupons![0].discountMinor + order.coupons![0].discountTaxMinor);
    crossCheck(order, {
      lineItems: [
        { product_id: 0, quantity: 1, tax_class: '', subtotal: '2.775000', total: '2.775000',
          subtotal_tax: '0.555000', total_tax: '0.555000', taxes: [{ id: 1, subtotal: '0.555000', total: '0.555000' }] },
        { product_id: 0, quantity: 1, tax_class: '', subtotal: '2.775000', total: '2.775000',
          subtotal_tax: '0.555000', total_tax: '0.555000', taxes: [{ id: 1, subtotal: '0.555000', total: '0.555000' }] },
        { product_id: 0, quantity: 1, tax_class: '', subtotal: '2.775000', total: '2.775000',
          subtotal_tax: '0.555000', total_tax: '0.555000', taxes: [{ id: 1, subtotal: '0.555000', total: '0.555000' }] },
      ],
      couponLines: [{ code: 'fixed1' }], couponConfigs: new Map([['fixed1', config('fixed_cart', '1')]]),
      taxRates: [{ id: 1, rate: '20.0000', compound: false, order: 1, priority: 1, class: 'standard' }],
      productCategories: new Map(), calcDiscountsSequentially: false, pricesIncludeTax: true, taxRoundAtSubtotal: false, dp: 2,
    }, false);
  });

  it('leaves return lines out of the replay', () => {
    const builder = make([rate(1, '0.0000')]);
    add(builder, 1000, 'p1');
    add(builder, -500, 'r');
    const returned = builder.getSnapshot().lineItems[1];
    builder.setCoupons(['ten']);
    const order = builder.getSnapshot();
    expect(order.coupons![0].discountMinor).toBe(100);
    expect(order.lineItems[1]).toEqual(returned);
    displayIdentity(order);
  });

  it('normalizes codes, deduplicates in order, and refuses unsupported codes without emitting', () => {
    const builder = make();
    add(builder, 1000);
    builder.setCoupons([' TEN ', 'ten']);
    const before = builder.getSnapshot();
    expect(before.coupons).toEqual([{ code: 'ten', couponId: '303', discountMinor: 100, discountTaxMinor: 20 }]);
    displayIdentity(before);
    for (const code of ['unknown', 'no-sale']) {
      expect(() => builder.setCoupons(['fixed3', code])).toThrow(RangeError);
      expect(() => builder.setCoupons([code])).toThrow(code);
      expect(builder.getSnapshot()).toBe(before);
    }
    builder.setCoupons([' TEN-B ', 'ten-a', 'ten-b']);
    expect(builder.getSnapshot().coupons!.map((row) => row.code)).toEqual(['ten-b', 'ten-a']);
    displayIdentity(builder.getSnapshot());
  });

  it('refuses a coupon without an id without changing codes, context or emissions', () => {
    const builder = fixedCart();
    builder.setCoupons(['ten']);
    const before = builder.getSnapshot();
    const emitted = vi.fn();
    const subscription = builder.order$.subscribe(emitted);
    const missingId = { ...couponContext, configs: new Map([...configs, ['x', config('percent', '20')]]) };
    expect(() => builder.setCoupons(['fixed3', 'x'], missingId)).toThrow(new RangeError('Coupon x has no id'));
    expect(builder.getSnapshot()).toBe(before);
    expect(emitted).toHaveBeenCalledTimes(1);
    expect(() => builder.setCoupons(['x'])).toThrow(new RangeError('Unknown coupon x'));
    expect(builder.getSnapshot()).toBe(before);
    expect(emitted).toHaveBeenCalledTimes(1);
    subscription.unsubscribe();
  });

  it('accepts a late coupon context and uses it on later calls', () => {
    const builder = createOrderBuilder({ currency: 'GBP', taxContext: context({ standard: [rate(1, '20.0000')] }) });
    add(builder, 1000);
    builder.setCoupons(['ten'], couponContext);
    expect(builder.getSnapshot().coupons).toEqual([{ code: 'ten', couponId: '303', discountMinor: 100, discountTaxMinor: 20 }]);
    builder.setCoupons(['fixed3']);
    expect(builder.getSnapshot().coupons).toEqual([{ code: 'fixed3', couponId: '301', discountMinor: 300, discountTaxMinor: 60 }]);
  });

  it('keeps the previous context and codes when a given context does not know a code', () => {
    const builder = fixedCart();
    builder.setCoupons(['ten']);
    const before = builder.getSnapshot();
    const emitted = vi.fn();
    const subscription = builder.order$.subscribe(emitted);
    const otherContext = { ...couponContext, configs: new Map([['fixed3', config('fixed_cart', '1')]]) };
    expect(() => builder.setCoupons(['fixed3', 'ten'], otherContext)).toThrow(new RangeError('Unknown coupon ten'));
    expect(builder.getSnapshot()).toBe(before);
    expect(emitted).toHaveBeenCalledTimes(1);
    builder.setCoupons(['fixed3', 'ten']);
    expect(builder.getSnapshot().coupons![0]).toEqual({ code: 'fixed3', couponId: '301', discountMinor: 300, discountTaxMinor: 60 });
    expect(builder.getSnapshot().coupons!.map((row) => row.code)).toEqual(['fixed3', 'ten']);
    subscription.unsubscribe();
  });

  it('replaces the context even with an empty coupon list', () => {
    const builder = fixedCart();
    builder.setCoupons(['ten']);
    const otherContext = { ...couponContext, configs: new Map([['x', config('fixed_cart', '1')]]), couponIds: new Map([['x', '401']]) };
    builder.setCoupons([], otherContext);
    expect(builder.getSnapshot()).not.toHaveProperty('coupons');
    expect(() => builder.setCoupons(['ten'])).toThrow(new RangeError('Unknown coupon ten'));
    builder.setCoupons(['x']);
    expect(builder.getSnapshot().coupons).toEqual([{ code: 'x', couponId: '401', discountMinor: 100, discountTaxMinor: 20 }]);
  });

  it('requires context only for a non-empty code list', () => {
    const builder = createOrderBuilder({ currency: 'GBP', taxContext: context({ standard: [rate(1, '20.0000')] }) });
    const before = builder.getSnapshot();
    expect(() => builder.setCoupons(['ten'])).toThrow(Error);
    expect(builder.getSnapshot()).toBe(before);
    expect(() => builder.setCoupons([])).not.toThrow();
    expect(builder.getSnapshot()).not.toHaveProperty('coupons');
  });

  it('removes coupons and restores the figures from before any coupons', () => {
    const builder = fixedCart();
    const withoutCoupons = builder.getSnapshot();
    builder.setCoupons(['fixed3']);
    displayIdentity(builder.getSnapshot());
    builder.setCoupons([]);
    const order = builder.getSnapshot();
    expect(order).not.toHaveProperty('coupons');
    expect(order.lineItems).toEqual(withoutCoupons.lineItems);
    expect(order.display).toEqual(withoutCoupons.display);
    expect([order.subtotalMinor, order.discountMinor, order.taxMinor, order.totalMinor])
      .toEqual([withoutCoupons.subtotalMinor, withoutCoupons.discountMinor, withoutCoupons.taxMinor, withoutCoupons.totalMinor]);
    displayIdentity(order);
  });

  it('clears the coupon list', () => {
    const builder = fixedCart();
    builder.setCoupons(['fixed3']);
    displayIdentity(builder.getSnapshot());
    builder.clear();
    expect(builder.getSnapshot()).not.toHaveProperty('coupons');
    expect(builder.getSnapshot().display).not.toHaveProperty('coupons');
    add(builder, 1000);
    expect(builder.getSnapshot().totalMinor).toBe(1200);
    expect(builder.getSnapshot()).not.toHaveProperty('coupons');
  });

  it('ignores stored codes under a non-WooCommerce tax context', () => {
    const builder = createOrderBuilder({ currency: 'GBP', couponContext, taxContext: {
      pricesIncludeTax: false, rounding: { granularity: 'per_order', mode: 'half_away_from_zero' }, getTaxRatePpm: () => 200000,
    } });
    add(builder, 1000);
    const before = builder.getSnapshot();
    builder.setCoupons(['ten']);
    const order = builder.getSnapshot();
    expect(order).not.toHaveProperty('coupons');
    expect(order.lineItems).toEqual(before.lineItems);
    expect(order.display).toEqual(before.display);
    expect([order.subtotalMinor, order.discountMinor, order.taxMinor, order.totalMinor])
      .toEqual([before.subtotalMinor, before.discountMinor, before.taxMinor, before.totalMinor]);
  });

  it('keeps coupons in written drafts, and restoring does not apply them', async () => {
    const builder = fixedCart();
    builder.setCoupons(['fixed3']);
    const order = builder.getSnapshot();
    displayIdentity(order);
    const drafts = { upsert: vi.fn() };
    await writeOrderDraft(drafts as unknown as Parameters<typeof writeOrderDraft>[0], order);
    const saved = JSON.parse(drafts.upsert.mock.calls[0][0].data);
    expect(saved.coupons).toEqual(order.coupons);
    const taxContext = context({ standard: [rate(1, '20.0000')] });
    expect(restoreOrderDraft(saved, { currency: 'GBP', taxContext }).getSnapshot()).not.toHaveProperty('coupons');
    expect(saved.lineItems).toEqual(order.lineItems);
    expect(order.coupons).toEqual([{ code: 'fixed3', couponId: '301', discountMinor: 300, discountTaxMinor: 60 }]);
  });
});

import { describe, expect, it } from 'vitest';
import type { woocommerceCoupons } from '@tallyui/core';
import type { TaxContext, WooRate } from '../tax/types';
import { couponPricingBasis, createOrderBuilder, type OrderBuilder, type OrderCouponContext, type StorePricedCouponContext } from './order-builder';
import type { LineItem } from './types';

// Copied from store-priced-coupons.test.ts.
const taxContext = (pricesIncludeTax = false): TaxContext =>
  ({ getTaxRatePpm: () => 200000, pricesIncludeTax, rounding: { granularity: 'per_order', mode: 'half_away_from_zero' } });
const make = (context = taxContext()) => createOrderBuilder({ currency: 'GBP', taxContext: context });
function add(builder: OrderBuilder, amount: number, productId = 'p', taxInclusive?: boolean) {
  return builder.addLine({ productId, name: productId, unitPrice: { amount, currency: 'GBP', taxInclusive } });
}
/** A store-priced context for the builder's current order: code to [couponId, [lineId, amount][]]. */
function priced(builder: OrderBuilder, codes: Record<string, [string, Array<[string, number]>]>): StorePricedCouponContext {
  return { kind: 'store-priced', basis: couponPricingBasis(builder.getSnapshot()), priced: new Map(Object.entries(codes)
    .map(([code, [couponId, lines]]) => [code, { couponId, lines: lines.map(([lineId, amountMinor]) => ({ lineId, amountMinor })) }])) };
}

// Copied from store-priced-coupons.test.ts.
const rate = (id: number, percent: string, extra: Partial<WooRate> = {}): WooRate => ({
  id, code: `rate-${id}`, label: `Rate ${id}`, rate: percent, priority: id, compound: false, shipping: true, ...extra,
});
function wooContext(rates: Record<string, WooRate[]>, pricesIncludeTax = false, roundAtSubtotal = false): TaxContext {
  return {
    pricesIncludeTax, rounding: { granularity: 'woocommerce', roundAtSubtotal },
    getTaxRatePpm: () => { throw new Error('WooCommerce must use the rate list'); },
    getTaxRates: (taxClass, options) => (rates[taxClass || 'standard'] ?? []).filter((rate) => !options?.shipping || rate.shipping),
  };
}
function config(discount_type: woocommerceCoupons.CouponDiscountConfig['discount_type'], amount: string): woocommerceCoupons.CouponDiscountConfig {
  return { discount_type, amount, limit_usage_to_x_items: null, product_ids: [], excluded_product_ids: [],
    product_categories: [], excluded_product_categories: [], exclude_sale_items: false };
}
const wooCoupons: OrderCouponContext = { configs: new Map([['fixed3', config('fixed_cart', '3')]]),
  couponIds: new Map([['fixed3', '301']]), productCategories: new Map(), calcDiscountsSequentially: false };

// Copied from the contract's exTaxMicros formula, independently of the builder helper.
function exTaxMicros(line: LineItem, woo: boolean): bigint {
  if (woo) return line.netMicros !== undefined ? BigInt(line.netMicros) : BigInt(line.netMinor) * 1_000_000n;
  return BigInt(line.netMinor) * 1_000_000n - (line.taxInclusive ? BigInt(line.taxMicros) : 0n);
}

describe('store-priced coupon lines (#790)', () => {
  it('apportions #786’s sale as in the contract worked example', () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { ...taxContext(true), getTaxRatePpm: () => 190000 } });
    const lineId = builder.addLine({ productId: 'p', name: 'p', unitPrice: { amount: 1190, currency: 'EUR' } });
    builder.applyLineDiscount(lineId, { type: 'percentage', value: 10 });
    builder.setCoupons(['c'], priced(builder, { c: ['promo_1', [[lineId, 100]]] }));
    const order = builder.getSnapshot();
    expect(order.coupons).toStrictEqual([{ code: 'c', couponId: 'promo_1', discountMinor: 84, discountTaxMinor: 16,
      lines: [{ lineId, discountMinor: 84, discountTaxMinor: 16 }] }]);
    expect(order.totalMinor).toBe(971);
  });

  it('splits two exclusive lines and two coupons exactly', () => {
    const builder = make(), l1 = add(builder, 1000, 'p1'), l2 = add(builder, 500, 'p2');
    builder.setCoupons(['a', 'b'], priced(builder, { a: ['ca', [[l1, 100], [l2, 50]]], b: ['cb', [[l2, 30]]] }));
    expect(builder.getSnapshot().coupons).toStrictEqual([
      { code: 'a', couponId: 'ca', discountMinor: 150, discountTaxMinor: 30, lines: [
        { lineId: l1, discountMinor: 100, discountTaxMinor: 20 }, { lineId: l2, discountMinor: 50, discountTaxMinor: 10 }] },
      { code: 'b', couponId: 'cb', discountMinor: 30, discountTaxMinor: 6, lines: [{ lineId: l2, discountMinor: 30, discountTaxMinor: 6 }] },
    ]);
  });

  it('splits the discount by ex-tax change and the tax by tax change when the lines carry different rates', () => {
    const builder = make(), l1 = add(builder, 1000, 'p1');
    const l2 = builder.addLine({ productId: 'p2', name: 'p2', unitPrice: { amount: 1000, currency: 'GBP' }, taxRates: [{ ratePpm: 0 }] });
    builder.setCoupons(['c'], priced(builder, { c: ['cc', [[l1, 100], [l2, 100]]] }));
    expect(builder.getSnapshot().coupons).toStrictEqual([{ code: 'c', couponId: 'cc', discountMinor: 200, discountTaxMinor: 20,
      lines: [{ lineId: l1, discountMinor: 100, discountTaxMinor: 20 }, { lineId: l2, discountMinor: 100, discountTaxMinor: 0 }] }]);
  });

  it('gives tied remainders to the earlier line', () => {
    const builder = make(taxContext(true));
    const l1 = add(builder, 100, 'p1'), l2 = add(builder, 100, 'p2'), l3 = add(builder, 100, 'p3');
    builder.setCoupons(['c'], priced(builder, { c: ['cc', [[l1, 10], [l2, 10], [l3, 10]]] }));
    expect(builder.getSnapshot().coupons).toStrictEqual([{ code: 'c', couponId: 'cc', discountMinor: 25, discountTaxMinor: 5, lines: [
      { lineId: l1, discountMinor: 9, discountTaxMinor: 2 },
      { lineId: l2, discountMinor: 8, discountTaxMinor: 2 },
      { lineId: l3, discountMinor: 8, discountTaxMinor: 1 },
    ] }]);
  });

  it('follows payload order and omits zero entries', () => {
    const builder = make(), l1 = add(builder, 1000, 'p1'), l2 = add(builder, 1000, 'p2'), l3 = add(builder, 1000, 'p3');
    builder.setCoupons(['c'], priced(builder, { c: ['cc', [[l3, 40], [l1, 0], [l2, 20]]] }));
    expect(builder.getSnapshot().coupons![0].lines).toStrictEqual([
      { lineId: l2, discountMinor: 20, discountTaxMinor: 4 }, { lineId: l3, discountMinor: 40, discountTaxMinor: 8 },
    ]);
  });

  it('gives a coupon worth nothing an empty lines array', () => {
    const builder = make(), l1 = add(builder, 1000);
    builder.setCoupons(['c'], priced(builder, { c: ['cc', [[l1, 0]]] }));
    expect(builder.getSnapshot().coupons![0].lines).toStrictEqual([]);
  });

  it('refuses a code that prices a line not on the sale and keeps the coupons', () => {
    const builder = make(), l1 = add(builder, 1000);
    builder.setCoupons(['c'], priced(builder, { c: ['cc', [[l1, 100]]] }));
    const before = builder.getSnapshot().coupons;
    expect(before).toHaveLength(1);
    expect(() => builder.setCoupons(['c', 'ghost'], priced(builder, { c: ['cc', [[l1, 100]]], ghost: ['cg', [['missing', 50]]] })))
      .toThrow(new RangeError('Coupon ghost prices a line not on the sale'));
    expect(builder.getSnapshot().coupons).toStrictEqual(before);
  });

  it('leaves lines off WooCommerce replay coupons', () => {
    const builder = createOrderBuilder({ currency: 'GBP', taxContext: wooContext({ standard: [rate(1, '20.0000')] }), couponContext: wooCoupons });
    add(builder, 1000, 'p1');
    add(builder, 500, 'p2');
    builder.setCoupons(['fixed3'], wooCoupons);
    const coupons = builder.getSnapshot().coupons!;
    expect(coupons).toHaveLength(1);
    for (const coupon of coupons) expect(coupon).not.toHaveProperty('lines');
  });

  // Measured maximum over this grid: 833333 micros (0.83 minor units).
  it('keeps sums exact and bounds the rounding difference across the grid', () => {
    let maximum = 0n;
    for (const pricesIncludeTax of [false, true]) {
      for (const ppm of [70000, 190000, 200000]) {
        for (const granularity of ['per_order', 'per_line_items'] as const) {
          const context: TaxContext = { pricesIncludeTax, getTaxRatePpm: () => ppm,
            rounding: { granularity, mode: 'half_away_from_zero' } };
          const builder = make(context);
          const ids = [[999, 1], [1001, 3], [1234, 2]].map(([unit, quantity], i) => {
            const id = add(builder, unit, `p${i}`);
            builder.updateQuantity(id, quantity);
            return id;
          });
          const pricing = priced(builder, { a: ['ca', [[ids[0], 137], [ids[1], 0], [ids[2], 251]]],
            b: ['cb', [[ids[0], 0], [ids[1], 99], [ids[2], 45]]] });
          const stages = [[], ['a'], ['a', 'b']].map((codes) => {
            builder.setCoupons(codes, pricing);
            return builder.getSnapshot();
          });
          const order = stages[2];
          for (const [k, coupon] of order.coupons!.entries()) {
            const lines = coupon.lines!;
            expect(lines.reduce((sum, line) => sum + line.discountMinor, 0)).toBe(coupon.discountMinor);
            expect(lines.reduce((sum, line) => sum + line.discountTaxMinor, 0)).toBe(coupon.discountTaxMinor);
            expect(lines.every((line) => line.discountMinor !== 0 || line.discountTaxMinor !== 0)).toBe(true);
            expect(lines.map((line) => line.lineId)).toEqual(ids.filter((id) => lines.some((line) => line.lineId === id)));
            for (const [i, id] of ids.entries()) {
              const e = exTaxMicros(stages[k].lineItems[i], false) - exTaxMicros(stages[k + 1].lineItems[i], false);
              const share = lines.find((line) => line.lineId === id)?.discountMinor ?? 0;
              const delta = BigInt(share) * 1_000_000n - e;
              const difference = delta < 0n ? -delta : delta;
              expect(difference).toBeLessThan(2_000_000n);
              if (difference > maximum) maximum = difference;
            }
          }
        }
      }
    }
  });

  // Measured maximum over this grid under WooCommerce rounding: 833300 micros (0.83 minor units).
  it('keeps sums exact and bounds the rounding difference across the grid under WooCommerce rounding', () => {
    let maximum = 0n;
    const rateLists: WooRate[][] = [[rate(1, '7.0000')], [rate(1, '19.0000')], [rate(1, '20.0000')],
      [rate(1, '19.0000'), rate(2, '7.0000', { compound: true })]];
    for (const pricesIncludeTax of [false, true]) {
      for (const roundAtSubtotal of [false, true]) {
        for (const standard of rateLists) {
          const builder = make(wooContext({ standard }, pricesIncludeTax, roundAtSubtotal));
          const ids = [[999, 1], [1001, 3], [1234, 2]].map(([unit, quantity], i) => {
            const id = add(builder, unit, `p${i}`);
            builder.updateQuantity(id, quantity);
            return id;
          });
          const pricing = priced(builder, { a: ['ca', [[ids[0], 137], [ids[1], 0], [ids[2], 251]]],
            b: ['cb', [[ids[0], 0], [ids[1], 99], [ids[2], 45]]] });
          const stages = [[], ['a'], ['a', 'b']].map((codes) => {
            builder.setCoupons(codes, pricing);
            return builder.getSnapshot();
          });
          const order = stages[2];
          expect(order.coupons!.map((coupon) => coupon.code)).toEqual(['a', 'b']);
          for (const [k, coupon] of order.coupons!.entries()) {
            const lines = coupon.lines!;
            expect(lines.reduce((sum, line) => sum + line.discountMinor, 0)).toBe(coupon.discountMinor);
            expect(lines.reduce((sum, line) => sum + line.discountTaxMinor, 0)).toBe(coupon.discountTaxMinor);
            expect(lines.every((line) => line.discountMinor !== 0 || line.discountTaxMinor !== 0)).toBe(true);
            expect(lines.map((line) => line.lineId)).toEqual(ids.filter((id) => lines.some((line) => line.lineId === id)));
            for (const [i, id] of ids.entries()) {
              const e = exTaxMicros(stages[k].lineItems[i], true) - exTaxMicros(stages[k + 1].lineItems[i], true);
              const share = lines.find((line) => line.lineId === id)?.discountMinor ?? 0;
              const delta = BigInt(share) * 1_000_000n - e;
              const difference = delta < 0n ? -delta : delta;
              expect(difference).toBeLessThanOrEqual(2_000_000n);
              if (difference > maximum) maximum = difference;
            }
          }
        }
      }
    }
  });
});

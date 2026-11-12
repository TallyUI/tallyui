import { describe, expect, it } from 'vitest';
import { woocommerceCoupons } from '@tallyui/core';
import type { TaxContext, WooRate } from '../tax/types';
import { couponPricingBasis, createOrderBuilder, type OrderBuilder, type OrderCouponContext, type StorePricedCouponContext } from './order-builder';
import type { Order } from './types';

// Copied from woocommerce-coupons.test.ts.
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
function displayIdentity(order: Order) {
  const d = order.display;
  expect(d.lines.reduce((sum, line) => sum + line.amountMinor, 0)).toBe(d.subtotalMinor);
  expect(d.subtotalMinor - d.discountMinor + [...(d.fees ?? []), ...(d.shipping ?? [])].reduce((sum, row) => sum + row.amountMinor, 0)
    + (d.taxInclusive ? 0 : d.taxMinor)).toBe(order.totalMinor);
}

// The order-builder.test.ts tax context, at 20% and per_order.
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
function oneLine(context?: TaxContext, amount = 1000) {
  const builder = make(context), line = add(builder, amount, 'p1');
  return { builder, line };
}

describe('store-priced coupons (#709)', () => {
  it('takes a coupon off an exclusive line, per_order', () => {
    const { builder, line } = oneLine();
    builder.setCoupons(['SAVE '], priced(builder, { save: ['c1', [[line, 300]]] }));
    const order = builder.getSnapshot();
    expect(order.coupons).toEqual([{ code: 'save', couponId: 'c1', discountMinor: 300, discountTaxMinor: 60,
      lines: [{ lineId: line, discountMinor: 300, discountTaxMinor: 60 }] }]);
    expect(order).toMatchObject({ subtotalMinor: 700, taxMinor: 140, totalMinor: 840, discountMinor: 0 });
    expect(order.lineItems[0]).toMatchObject({ discountMinor: 0, orderDiscountMinor: 0, netMinor: 700, discounts: [] });
    expect(order.display.coupons).toEqual([{ code: 'save', amountMinor: 300 }]);
    expect(order.display).toMatchObject({ subtotalMinor: 1000, discountMinor: 300 });
    expect(order).not.toHaveProperty('couponPricesStale');
    displayIdentity(order);
  });

  it('takes a coupon off an inclusive line, and shows it with its tax', () => {
    const { builder, line } = oneLine(taxContext(true), 1200);
    builder.setCoupons(['save'], priced(builder, { save: ['c1', [[line, 240]]] }));
    const order = builder.getSnapshot();
    expect(order.coupons).toEqual([{ code: 'save', couponId: 'c1', discountMinor: 200, discountTaxMinor: 40,
      lines: [{ lineId: line, discountMinor: 200, discountTaxMinor: 40 }] }]);
    expect(order).toMatchObject({ subtotalMinor: 800, taxMinor: 160, totalMinor: 960, discountMinor: 0 });
    expect(order.lineItems[0].discountMinor).toBe(0);
    expect(order.display.coupons).toEqual([{ code: 'save', amountMinor: 240 }]);
    expect(order.display.coupons![0].amountMinor).toBe(order.coupons![0].discountMinor + order.coupons![0].discountTaxMinor);
    expect(order.display).toMatchObject({ subtotalMinor: 1200, discountMinor: 240 });
    displayIdentity(order);
  });

  it("prices an inclusive and an exclusive line in one order, each in its own mode", () => {
    const builder = make();
    const inclusive = add(builder, 1200, 'p1', true), exclusive = add(builder, 1000, 'p2');
    const before = builder.getSnapshot();
    builder.setCoupons(['save'], priced(builder, { save: ['c1', [[inclusive, 120], [exclusive, 100]]] }));
    const order = builder.getSnapshot();
    expect(order.lineItems.map((li) => li.netMinor)).toEqual([1080, 900]);
    // e/t in minor units: inclusive 100/20, exclusive 100/20, so both splits are equal.
    expect(order.coupons).toEqual([{ code: 'save', couponId: 'c1', discountMinor: 200, discountTaxMinor: 40,
      lines: [{ lineId: inclusive, discountMinor: 100, discountTaxMinor: 20 }, { lineId: exclusive, discountMinor: 100, discountTaxMinor: 20 }] }]);
    expect(order).toMatchObject({ subtotalMinor: 1800, taxMinor: 360, totalMinor: 2160 });
    expect(order.display).toMatchObject({ subtotalMinor: 2000, discountMinor: 200 });
    expect(order.display.lines).toEqual(before.display.lines);
    displayIdentity(order);
  });

  it('applies two coupons in code order, the second capped by what the first left', () => {
    const builder = make();
    const l1 = add(builder, 1000, 'p1'), l2 = add(builder, 500, 'p2');
    const before = builder.getSnapshot();
    builder.setCoupons(['a', 'b'], priced(builder, { a: ['ca', [[l1, 600], [l2, 100]]], b: ['cb', [[l1, 700], [l2, 50]]] }));
    const order = builder.getSnapshot();
    expect(order.lineItems.map((li) => li.netMinor)).toEqual([0, 350]);
    // e/t in minor units: a takes 600/120 and 100/20; b takes the remaining 400/80 and 50/10.
    expect(order.coupons).toEqual([
      { code: 'a', couponId: 'ca', discountMinor: 700, discountTaxMinor: 140,
        lines: [{ lineId: l1, discountMinor: 600, discountTaxMinor: 120 }, { lineId: l2, discountMinor: 100, discountTaxMinor: 20 }] },
      { code: 'b', couponId: 'cb', discountMinor: 450, discountTaxMinor: 90,
        lines: [{ lineId: l1, discountMinor: 400, discountTaxMinor: 80 }, { lineId: l2, discountMinor: 50, discountTaxMinor: 10 }] },
    ]);
    expect(order.coupons!.reduce((sum, c) => sum + c.discountMinor, 0)).toBe(before.subtotalMinor - order.subtotalMinor);
    expect(order.coupons!.reduce((sum, c) => sum + c.discountTaxMinor, 0)).toBe(before.taxMinor - order.taxMinor);
    displayIdentity(order);
  });

  it('comes off what a line discount and an order discount leave', () => {
    const { builder, line } = oneLine();
    builder.applyLineDiscount(line, { type: 'fixed', value: 100 });
    builder.applyOrderDiscount({ type: 'fixed', value: 100 });
    builder.setCoupons(['save'], priced(builder, { save: ['c1', [[line, 300]]] }));
    const order = builder.getSnapshot();
    expect(order.lineItems[0]).toMatchObject({ discountMinor: 200, orderDiscountMinor: 100, netMinor: 500 });
    expect(order.coupons).toEqual([{ code: 'save', couponId: 'c1', discountMinor: 300, discountTaxMinor: 60,
      lines: [{ lineId: line, discountMinor: 300, discountTaxMinor: 60 }] }]);
    expect(order).toMatchObject({ subtotalMinor: 500, taxMinor: 100, totalMinor: 600, discountMinor: 200 });
    expect(order.display).toMatchObject({ subtotalMinor: 1000, discountMinor: 500, orderDiscountMinor: 100 });
    displayIdentity(order);
  });

  it('caps an amount larger than the line has left, never below 0', () => {
    const { builder, line } = oneLine();
    builder.applyLineDiscount(line, { type: 'fixed', value: 400 });
    builder.setCoupons(['save'], priced(builder, { save: ['c1', [[line, 900]]] }));
    const order = builder.getSnapshot();
    expect(order.lineItems[0]).toMatchObject({ netMinor: 0, discountMinor: 400, taxMicros: '0' });
    expect(order.coupons).toEqual([{ code: 'save', couponId: 'c1', discountMinor: 600, discountTaxMinor: 120,
      lines: [{ lineId: line, discountMinor: 600, discountTaxMinor: 120 }] }]);
    expect(order).toMatchObject({ subtotalMinor: 0, taxMinor: 0, totalMinor: 0 });
    expect(order.display).toMatchObject({ subtotalMinor: 1000, discountMinor: 1000 });
    displayIdentity(order);
  });

  it('uses the WooCommerce totals under woocommerce granularity, without the replay', () => {
    const builder = make(wooContext({ standard: [rate(1, '20.0000')] }));
    const l1 = add(builder, 1000, 'p1');
    add(builder, 500, 'p2');
    const before = builder.getSnapshot();
    builder.setCoupons(['save'], priced(builder, { save: ['c1', [[l1, 300]]] }));
    const order = builder.getSnapshot();
    expect(order.lineItems.map((li) => li.netMinor)).toEqual([700, 500]);
    expect(order.coupons).toEqual([{ code: 'save', couponId: 'c1', discountMinor: 300, discountTaxMinor: 60,
      lines: [{ lineId: l1, discountMinor: 300, discountTaxMinor: 60 }] }]);
    expect(order).toMatchObject({ subtotalMinor: 1200, taxMinor: 240, totalMinor: 1440, discountMinor: 0 });
    expect(order.display.coupons).toEqual([{ code: 'save', amountMinor: 300 }]);
    expect(order.display).toMatchObject({ subtotalMinor: 1500, discountMinor: 300 });
    expect(order.display.lines).toEqual(before.display.lines);
    displayIdentity(order);
  });

  it('leaves the WooCommerce replay unchanged once a Woo context replaces a store-priced one', () => {
    const builder = createOrderBuilder({ currency: 'GBP', taxContext: wooContext({ standard: [rate(1, '20.0000')] }), couponContext: wooCoupons });
    const l1 = add(builder, 1000, 'p1');
    add(builder, 500, 'p2');
    builder.setCoupons(['save'], priced(builder, { save: ['c1', [[l1, 300]]] }));
    builder.setCoupons(['fixed3'], wooCoupons);
    const order = builder.getSnapshot();
    expect(order.coupons).toEqual([{ code: 'fixed3', couponId: '301', discountMinor: 300, discountTaxMinor: 60 }]);
    expect(order.lineItems.map((line) => line.netMinor)).toEqual([850, 350]);
    expect(order).toMatchObject({ subtotalMinor: 1200, taxMinor: 240, totalMinor: 1440, discountMinor: 0 });
    expect(order.display.coupons).toEqual([{ code: 'fixed3', amountMinor: 300 }]);
    expect(order).not.toHaveProperty('couponPricesStale');
    builder.updateQuantity(l1, 2);
    expect(builder.getSnapshot()).not.toHaveProperty('couponPricesStale');
  });

  describe('setCoupons', () => {
    it.each<[string, Record<string, [string, Array<[string, number]>]>, string]>([
      ['an unknown code', { other: ['c1', [['LINE', 100]]] }, 'Unknown coupon save'],
      ['an empty id', { save: ['', [['LINE', 100]]] }, 'Coupon save has no id'],
      ['a negative amount', { save: ['c1', [['LINE', -1]]] }, 'Coupon save has an invalid amount'],
      ['a fractional amount', { save: ['c1', [['LINE', 1.5]]] }, 'Coupon save has an invalid amount'],
      ['an unsafe amount', { save: ['c1', [['LINE', 2 ** 53]]] }, 'Coupon save has an invalid amount'],
      ['a repeated line', { save: ['c1', [['LINE', 100], ['LINE', 100]]] }, 'Coupon save has an invalid amount'],
      ['a line not on the order', { save: ['c1', [['ghost', 100]]] }, 'Coupon save prices a line not on the sale'],
      ['a return line', { save: ['c1', [['RETURN', 100]]] }, 'Coupon save prices a line not on the sale'],
    ])('refuses %s with a RangeError and leaves the state', (_name, codes, message) => {
      const { builder, line } = oneLine();
      const returned = add(builder, -500, 'r1');
      builder.setCoupons(['kept'], priced(builder, { kept: ['c0', [[line, 100]]] }));
      const before = builder.getSnapshot();
      const swap = (id: string) => id === 'LINE' ? line : id === 'RETURN' ? returned : id;
      const context = priced(builder, Object.fromEntries(Object.entries(codes).map(([code, [couponId, lines]]): [string, [string, Array<[string, number]>]] =>
        [code, [couponId, lines.map(([id, amount]): [string, number] => [swap(id), amount])]])));
      let error: unknown;
      try { builder.setCoupons(['save'], context); } catch (caught) { error = caught; }
      expect(error).toBeInstanceOf(RangeError);
      expect((error as Error).message).toBe(message);
      expect(builder.getSnapshot()).toBe(before);
      expect(builder.getSnapshot().coupons).toEqual([{ code: 'kept', couponId: 'c0', discountMinor: 100, discountTaxMinor: 20,
        lines: [{ lineId: line, discountMinor: 100, discountTaxMinor: 20 }] }]);
    });

    it('ignores priced codes that are not set, and re-validates the current context when none is given', () => {
      const { builder, line } = oneLine();
      const other = add(builder, 500, 'p2');
      builder.setCoupons(['save'], priced(builder, { save: ['c1', [[line, 100]]], unused: ['c2', [[other, 100]]] }));
      expect(builder.getSnapshot().coupons!.map((c) => c.code)).toEqual(['save']);
      builder.setCoupons(['save', 'unused']);
      expect(builder.getSnapshot().coupons!.map((c) => c.code)).toEqual(['save', 'unused']);
      builder.removeItem(other);
      expect(() => builder.setCoupons(['unused'])).toThrow(new RangeError('Coupon unused prices a line not on the sale'));
    });

    it('removes the coupons and the stale flag with setCoupons([])', () => {
      const { builder, line } = oneLine();
      builder.setCoupons(['save'], priced(builder, { save: ['c1', [[line, 100]]] }));
      builder.updateQuantity(line, 2);
      expect(builder.getSnapshot().couponPricesStale).toBe(true);
      builder.setCoupons([]);
      const order = builder.getSnapshot();
      expect(order).not.toHaveProperty('coupons');
      expect(order).not.toHaveProperty('couponPricesStale');
      expect(order.display).not.toHaveProperty('coupons');
      expect(order.totalMinor).toBe(2400);
    });

    it('removes the coupons, the stale flag and the store-priced context with clear()', () => {
      const { builder, line } = oneLine();
      builder.setCoupons(['save'], priced(builder, { save: ['c1', [[line, 100]]] }));
      builder.updateQuantity(line, 2);
      builder.clear();
      const order = builder.getSnapshot();
      expect(order).not.toHaveProperty('coupons');
      expect(order).not.toHaveProperty('couponPricesStale');
      add(builder, 1000, 'p1');
      expect(() => builder.setCoupons(['save'])).toThrow('Coupon context is required');
    });
  });

  describe('staleness', () => {
    function pricedSale() {
      const { builder, line } = oneLine();
      const other = add(builder, 500, 'p2');
      builder.setCustomer({ id: 'cust-1', name: 'Ann' });
      builder.setCoupons(['save'], priced(builder, { save: ['c1', [[line, 300], [other, 100]]] }));
      return { builder, line, other };
    }

    it('is fresh after pricing', () => {
      expect(pricedSale().builder.getSnapshot()).not.toHaveProperty('couponPricesStale');
    });

    it.each<[string, (sale: ReturnType<typeof pricedSale>) => void]>([
      ['updateQuantity', ({ builder, line }) => builder.updateQuantity(line, 2)],
      ['removeItem', ({ builder, other }) => builder.removeItem(other)],
      ['applyLineDiscount', ({ builder, line }) => builder.applyLineDiscount(line, { type: 'fixed', value: 50 })],
      ['applyOrderDiscount', ({ builder }) => builder.applyOrderDiscount({ type: 'percentage', value: 10 })],
      ['setUnitPrice', ({ builder, line }) => builder.setUnitPrice(line, 900)],
      ['setCustomer', ({ builder }) => builder.setCustomer({ id: 'cust-2', name: 'Bo' })],
    ])('is stale after %s, and still applies the amounts', (_name, change) => {
      const sale = pricedSale();
      change(sale);
      const order = sale.builder.getSnapshot();
      expect(order.couponPricesStale).toBe(true);
      expect(order.coupons).toHaveLength(1);
      expect(order.coupons![0].discountMinor).toBeGreaterThan(0);
      displayIdentity(order);
    });

    it.each<[string, (sale: ReturnType<typeof pricedSale>) => void]>([
      ['setNote', ({ builder }) => builder.setNote('gift')],
      ['addFee', ({ builder }) => builder.addFee({ name: 'Bag', amountMinor: 20 })],
      ['addShipping', ({ builder }) => builder.addShipping({ name: 'Delivery', amountMinor: 30 })],
    ])('is not stale after %s', (_name, change) => {
      const sale = pricedSale();
      change(sale);
      const order = sale.builder.getSnapshot();
      expect(order).not.toHaveProperty('couponPricesStale');
      // e/t in minor units: sale.line 300/60 and sale.other 100/20, a 3:1 split for both totals.
      expect(order.coupons).toEqual([{ code: 'save', couponId: 'c1', discountMinor: 400, discountTaxMinor: 80,
        lines: [{ lineId: sale.line, discountMinor: 300, discountTaxMinor: 60 }, { lineId: sale.other, discountMinor: 100, discountTaxMinor: 20 }] }]);
      displayIdentity(order);
    });

    it('never changes couponPricingBasis by applying or removing coupons', () => {
      const { builder, line } = oneLine();
      builder.applyLineDiscount(line, { type: 'percentage', value: 5 });
      const basis = couponPricingBasis(builder.getSnapshot());
      builder.setCoupons(['save'], priced(builder, { save: ['c1', [[line, 300]]] }));
      expect(couponPricingBasis(builder.getSnapshot())).toBe(basis);
      builder.setCoupons([]);
      expect(couponPricingBasis(builder.getSnapshot())).toBe(basis);
    });

    it('takes nothing for a listed line that was removed', () => {
      const { builder, other } = pricedSale();
      builder.removeItem(other);
      const order = builder.getSnapshot();
      expect(order.coupons).toEqual([{ code: 'save', couponId: 'c1', discountMinor: 300, discountTaxMinor: 60,
        lines: [{ lineId: order.lineItems[0].id, discountMinor: 300, discountTaxMinor: 60 }] }]);
      expect(order).toMatchObject({ subtotalMinor: 700, taxMinor: 140, totalMinor: 840, couponPricesStale: true });
    });
  });
});

describe('store-priced coupon display rows (#709 addendum 1)', () => {
  /** The settlement figure the display subtotal is derived from. */
  const basisOf = (order: Order) => order.display.taxInclusive ? order.totalMinor : order.totalMinor - order.taxMinor;
  function withCoupons(builder: OrderBuilder, codes: Record<string, [string, Array<[string, number]>]>) {
    const before = builder.getSnapshot();
    builder.setCoupons(Object.keys(codes), priced(builder, codes));
    return { before, order: builder.getSnapshot() };
  }
  function sameDisplay(before: Order, order: Order) {
    expect(order.display.subtotalMinor).toBe(before.display.subtotalMinor);
    expect(order.display.lines).toEqual(before.display.lines);
    expect(order.display.coupons!.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(basisOf(before) - basisOf(order));
    displayIdentity(order);
  }

  it('shows an inclusive coupon beside a taxed fee as the total it took off, per_order', () => {
    const builder = make(taxContext(true)), line = add(builder, 1000, 'p1');
    builder.addFee({ name: 'Bag', amountMinor: 100 });
    const { before, order } = withCoupons(builder, { save: ['c1', [[line, 3]]] });
    sameDisplay(before, order);
    expect(order.display.coupons![0].amountMinor).toBe(before.totalMinor - order.totalMinor);
  });

  it('keeps an exclusive per_rate_group_items display with a fee and an inclusive line', () => {
    const builder = make({ getTaxRatePpm: () => 200000, pricesIncludeTax: false, rounding: { granularity: 'per_rate_group_items', mode: 'half_up' } });
    const exclusive = add(builder, 969, 'p1', false), inclusive = add(builder, 1264, 'p2', true);
    builder.addFee({ name: 'Bag', amountMinor: 146 });
    const { before, order } = withCoupons(builder, { save: ['c1', [[exclusive, 12], [inclusive, 32]]] });
    sameDisplay(before, order);
  });

  it('keeps the coupon-less display and telescopes the settlement figures over 300 seeded carts', () => {
    let seed = 709;
    const pick = (n: number) => { seed = (seed * 48271) % 2147483647; return seed % n; }; // MINSTD: exact in doubles
    const failures: string[] = [];
    for (let n = 0; n < 300; n++) {
      const granularity = (['per_order', 'per_rate_group_items', 'woocommerce'] as const)[pick(3)];
      const inclusive = pick(2) === 1, ppm = [50000, 190000, 200000, 210000][pick(4)], woo = granularity === 'woocommerce';
      const builder = make(woo ? wooContext({ standard: [rate(1, (ppm / 10000).toFixed(4))] }, inclusive)
        : { getTaxRatePpm: () => ppm, pricesIncludeTax: inclusive, rounding: { granularity, mode: 'half_up' } });
      const lines = Array.from({ length: 1 + pick(3) }, (_, k) => add(builder, 1 + pick(1500), `p${k}`, woo ? undefined : pick(2) === 1));
      if (pick(3) === 0) builder.applyLineDiscount(lines[0], { type: 'percentage', value: 1 + pick(30) });
      if (pick(3) === 0) builder.applyOrderDiscount({ type: 'fixed', value: 1 + pick(200) });
      if (pick(2) === 0) builder.addFee({ name: 'Bag', amountMinor: 1 + pick(200) });
      if (pick(3) === 0) builder.addShipping({ name: 'Delivery', amountMinor: 1 + pick(300) });
      const codes: Record<string, [string, Array<[string, number]>]> = {};
      for (const code of ['a', 'b', 'c'].slice(0, 1 + pick(3))) {
        codes[code] = [`id-${code}`, lines.filter(() => pick(4) !== 0).map((id): [string, number] => [id, pick(300)])];
      }
      try {
        const { before, order } = withCoupons(builder, codes);
        const sum = <T,>(rows: ReadonlyArray<T>, value: (row: T) => number) => rows.reduce((total, row) => total + value(row), 0);
        const moved = [
          order.display.subtotalMinor !== before.display.subtotalMinor && 'display subtotal',
          JSON.stringify(order.display.lines) !== JSON.stringify(before.display.lines) && 'display lines',
          sum(order.coupons!, (c) => c.discountMinor) !== before.subtotalMinor - order.subtotalMinor && 'Σ discountMinor',
          sum(order.coupons!, (c) => c.discountTaxMinor) !== before.taxMinor - order.taxMinor && 'Σ discountTaxMinor',
          sum(order.display.coupons!, (row) => row.amountMinor) !== basisOf(before) - basisOf(order) && 'Σ display coupons',
        ].filter(Boolean);
        if (moved.length) failures.push(`case ${n} (${granularity}): ${moved.join(', ')}`);
      } catch (error) {
        failures.push(`case ${n} (${granularity}): ${String(error)}`);
      }
    }
    expect(failures).toEqual([]);
  });
});

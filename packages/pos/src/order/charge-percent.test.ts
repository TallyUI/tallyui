import { describe, expect, it } from 'vitest';
import type { woocommerceCoupons } from '@tallyui/core';
import { finalizeOrder } from '../pos-order/finalize';
import type { TaxContext, WooRate } from '../tax/types';
import { couponPricingBasis, createOrderBuilder, type OrderBuilder, type OrderCouponContext, type StorePricedCouponContext } from './order-builder';
import { restoreOrderDraft } from './order-drafts';
import type { ChargeLine, Order } from './types';

// rate, context, make, add, displayIdentity, genericContext, makeGeneric and product are copied from charge-tax-mode.test.ts.
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
function make(rates = [rate(1, '10.0000')], inclusive = false, subtotal = false, currency = 'GBP') {
  return createOrderBuilder({ currency, taxContext: context({ standard: rates }, inclusive, subtotal) });
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
const genericContext = (pricesIncludeTax: boolean): TaxContext => ({
  pricesIncludeTax,
  getTaxRatePpm: (taxClass) => taxClass === 'zero' ? 0 : 100000,
  getTaxRateCode: (taxClass) => taxClass === 'zero' ? 'Zero' : 'VAT',
});
const makeGeneric = (inclusive: boolean) => createOrderBuilder({ currency: 'EUR', taxContext: genericContext(inclusive) });
const product = (amount: number) => ({ productId: 'p', name: 'Product', unitPrice: { amount, currency: 'EUR' } });

/** A WooCommerce fee's tax in minor units. */
const wooFeeTax = (fee: ChargeLine) => fee.totalMinor! - fee.netMinor;
const percentFee = (percent: number, extra: { amountIncludesTax?: boolean } = {}) => ({ name: 'Fee', amountMinor: 0, percent, ...extra });

/** X1: an exclusive store, one line 2000, a 10% fee. */
function x1() {
  const builder = make();
  const line = add(builder, 2000);
  const id = builder.addFee(percentFee(10));
  return { builder, line, id };
}
/** M1: an inclusive store, line 2200, a 10% fee entered without tax. */
function m1() {
  const builder = make([rate(1, '10.0000')], true);
  const line = add(builder, 2200);
  const id = builder.addFee(percentFee(10, { amountIncludesTax: false }));
  return { builder, line, id };
}
const fee = (builder: OrderBuilder) => builder.getSnapshot().fees![0];

describe('vendurepos gap 2.10: a fee as a percentage of the cart, WooCommerce', () => {
  it('X1: an exclusive store takes 10% of the net', () => {
    const { builder } = x1();
    const order = builder.getSnapshot();
    expect(order.fees![0]).toMatchObject({ amountMinor: 200, percent: 10 });
    expect(wooFeeTax(order.fees![0])).toBe(20);
    expect(order).toMatchObject({ taxMinor: 220, totalMinor: 2420 });
    displayIdentity(order);
  });

  it('N1: an inclusive store takes 10% of the gross, inclusive', () => {
    const builder = make([rate(1, '10.0000')], true);
    add(builder, 2200);
    builder.addFee(percentFee(10));
    const order = builder.getSnapshot();
    expect(order.fees![0]).toMatchObject({ amountMinor: 220, netMinor: 200, totalMinor: 220 });
    expect(wooFeeTax(order.fees![0])).toBe(20);
    expect(order).toMatchObject({ taxMinor: 220, totalMinor: 2420 });
    displayIdentity(order);
  });

  it('M1: the basis follows the store, not the fee\'s own mode', () => {
    const { builder } = m1();
    const order = builder.getSnapshot();
    expect(order.fees![0]).toMatchObject({ amountMinor: 220, amountIncludesTax: false, netMinor: 220, totalMinor: 242 });
    expect(wooFeeTax(order.fees![0])).toBe(22);
    expect(order.totalMinor).toBe(2442);
    displayIdentity(order);
  });

  it('Q1: the fee follows a quantity change', () => {
    const { builder, line } = x1();
    builder.updateQuantity(line, 3);
    expect(fee(builder).amountMinor).toBe(600);
    displayIdentity(builder.getSnapshot());
  });

  it('R1: the fee follows removed lines, down to 0', () => {
    const builder = make();
    const a = add(builder, 2000, 'a'), b = add(builder, 1000, 'b');
    builder.addFee(percentFee(10));
    expect(fee(builder).amountMinor).toBe(300);
    displayIdentity(builder.getSnapshot());
    builder.removeItem(b);
    expect(fee(builder).amountMinor).toBe(200);
    displayIdentity(builder.getSnapshot());
    builder.removeItem(a);
    expect(fee(builder).amountMinor).toBe(0);
    expect(wooFeeTax(fee(builder))).toBe(0);
    displayIdentity(builder.getSnapshot());
  });

  it('O1: the fee follows an order discount', () => {
    const { builder } = x1();
    builder.applyOrderDiscount({ type: 'fixed', value: 500 });
    let order = builder.getSnapshot();
    expect(order.fees![0].amountMinor).toBe(150);
    expect(order.totalMinor).toBe(1815);
    displayIdentity(order);
    builder.removeDiscount(order.discounts[0].id);
    order = builder.getSnapshot();
    expect(order.fees![0].amountMinor).toBe(200);
    displayIdentity(order);
  });

  it('C1: the fee is taken after a replayed WooCommerce coupon', () => {
    // The fixed-cart config and context are copied from woocommerce-coupons.test.ts, at 5.00.
    const config: woocommerceCoupons.CouponDiscountConfig = { discount_type: 'fixed_cart', amount: '5', limit_usage_to_x_items: null,
      product_ids: [], excluded_product_ids: [], product_categories: [], excluded_product_categories: [], exclude_sale_items: false };
    const couponContext: OrderCouponContext = { configs: new Map([['fixed5', config]]), couponIds: new Map([['fixed5', '301']]),
      productCategories: new Map(), calcDiscountsSequentially: false };
    const builder = createOrderBuilder({ currency: 'GBP', taxContext: context({ standard: [rate(1, '10.0000')] }), couponContext });
    add(builder, 2000);
    builder.addFee(percentFee(10));
    builder.setCoupons(['fixed5']);
    let order = builder.getSnapshot();
    expect(order.coupons![0].discountMinor).toBe(500);
    expect(order.fees![0].amountMinor).toBe(150);
    displayIdentity(order);
    builder.setCoupons([]);
    order = builder.getSnapshot();
    expect(order.fees![0].amountMinor).toBe(200);
    displayIdentity(order);
  });

  it('H1: 25.125 rounds down', () => {
    const builder = make();
    add(builder, 1005);
    builder.addFee(percentFee(2.5));
    expect(fee(builder).amountMinor).toBe(25);
    displayIdentity(builder.getSnapshot());
  });

  it('H2: 25.5 rounds up', () => {
    const builder = make();
    add(builder, 1020);
    builder.addFee(percentFee(2.5));
    expect(fee(builder).amountMinor).toBe(26);
    displayIdentity(builder.getSnapshot());
  });

  it('H3: 3000 at 1.15% is exactly 34.5, which rounds up to 35 (float maths gives 34.49999999999999, so 34)', () => {
    // The spec's 333 at 33.3333% gives 111 in float too, so it can't tell exact from float maths.
    const builder = make();
    add(builder, 3000);
    builder.addFee(percentFee(1.15));
    expect(fee(builder).amountMinor).toBe(35);
    displayIdentity(builder.getSnapshot());
  });

  it('U1: an update to a fixed amount drops the percent', () => {
    const { builder, line, id } = x1();
    builder.updateFee(id, { percent: undefined, amountMinor: 500 });
    builder.updateQuantity(line, 3);
    expect(fee(builder).amountMinor).toBe(500);
    expect(fee(builder)).not.toHaveProperty('percent');
    displayIdentity(builder.getSnapshot());
  });

  it('U2: an update turns a fixed fee into a percent fee', () => {
    const builder = make();
    add(builder, 2000);
    const id = builder.addFee({ name: 'Fee', amountMinor: 500 });
    builder.updateFee(id, { percent: 10 });
    expect(fee(builder).amountMinor).toBe(200);
    displayIdentity(builder.getSnapshot());
  });

  it('V1: a percent out of range or past 4 places is refused', () => {
    for (const percent of [0, -1, 100.5, Number.NaN, Number.POSITIVE_INFINITY, 1.23456]) {
      expect(() => make().addFee(percentFee(percent))).toThrow(new RangeError('Percent must be > 0 and <= 100, with at most 4 decimal places'));
    }
    for (const percent of [100, 0.0001]) expect(() => make().addFee(percentFee(percent))).not.toThrow();
  });

  it('V2: shipping cannot be a percentage', () => {
    expect(() => make().addShipping({ name: 'Post', amountMinor: 0, percent: 10 })).toThrow(new RangeError('Shipping cannot be a percentage'));
  });

  it('D1: a parked draft keeps the percent', () => {
    const { builder } = x1();
    const saved = JSON.parse(JSON.stringify(builder.getSnapshot()));
    const restored = restoreOrderDraft(saved, { currency: 'GBP', taxContext: context({ standard: [rate(1, '10.0000')] }) });
    expect(fee(restored).percent).toBe(10);
    restored.updateQuantity(restored.getSnapshot().lineItems[0].id, 2);
    expect(fee(restored).amountMinor).toBe(400);
    displayIdentity(restored.getSnapshot());
  });
});

describe('vendurepos gap 2.10: a fee as a percentage of the cart, store-priced coupons', () => {
  it('C2: the fee is taken after the store\'s coupon, which prices as with the same fixed fee', () => {
    // The fixture is copied from store-priced-coupons.test.ts: 20%, per_order, an exclusive line 1000 and a 300 coupon.
    const taxContext: TaxContext = { getTaxRatePpm: () => 200000, pricesIncludeTax: false, rounding: { granularity: 'per_order', mode: 'half_away_from_zero' } };
    const build = (charge: { name: string; amountMinor: number; percent?: number }) => {
      const builder = createOrderBuilder({ currency: 'GBP', taxContext });
      const line = builder.addLine({ productId: 'p1', name: 'p1', unitPrice: { amount: 1000, currency: 'GBP' } });
      const priced: StorePricedCouponContext = { kind: 'store-priced', basis: couponPricingBasis(builder.getSnapshot()),
        priced: new Map([['save', { couponId: 'c1', lines: [{ lineId: line, amountMinor: 300 }] }]]) };
      builder.addFee(charge);
      builder.setCoupons(['save'], priced);
      return builder.getSnapshot();
    };
    const order = build(percentFee(10));
    const basis = order.lineItems.reduce((sum, li) => sum + li.netMinor, 0);
    expect(basis).toBe(700);
    expect(order.fees![0].amountMinor).toBe(Math.floor((basis * 10) / 100 + 0.5));
    expect(order.fees![0].amountMinor).toBe(70);
    const fixed = build({ name: 'Fee', amountMinor: 70 });
    const figures = (o: Order) => o.coupons!.map(({ discountMinor, discountTaxMinor }) => ({ discountMinor, discountTaxMinor }));
    expect(figures(order)).toEqual(figures(fixed));
    displayIdentity(order);
  });
});

describe('vendurepos gap 2.10: a fee as a percentage of the cart, WooCommerce rounding with store-priced coupons', () => {
  it.each([['an exclusive store', false, 1000, 70], ['an inclusive store', true, 1100, 80]])(
    'C3: %s takes the fee after the store\'s coupon, in the store\'s mode, and prices as with the same fixed fee', (_, inclusive, amount, expected) => {
      const taxContext = context({ standard: [rate(1, '10.0000')] }, inclusive);
      const build = (charge: { name: string; amountMinor: number; percent?: number }) => {
        const builder = createOrderBuilder({ currency: 'GBP', taxContext });
        const line = builder.addLine({ productId: 'p1', name: 'p1', unitPrice: { amount, currency: 'GBP' } });
        const priced: StorePricedCouponContext = { kind: 'store-priced', basis: couponPricingBasis(builder.getSnapshot()),
          priced: new Map([['save', { couponId: 'c1', lines: [{ lineId: line, amountMinor: 300 }] }]]) };
        builder.addFee(charge);
        builder.setCoupons(['save'], priced);
        return builder.getSnapshot();
      };
      const order = build(percentFee(10));
      // Exclusive: the line's net after the coupon (700). Inclusive: its total after the coupon (800).
      const basis = order.lineItems.reduce((sum, li) => sum + (inclusive ? li.totalMinor! : li.netMinor), 0);
      expect(basis).toBe(inclusive ? 800 : 700);
      expect(order.fees![0].amountMinor).toBe(expected);
      const fixed = build({ name: 'Fee', amountMinor: expected });
      const figures = (o: Order) => o.coupons!.map(({ discountMinor, discountTaxMinor }) => ({ discountMinor, discountTaxMinor }));
      expect(figures(order)).toEqual(figures(fixed));
      displayIdentity(order);
    });
});

describe('vendurepos gap 2.10: a fee as a percentage of the cart, generic', () => {
  it('G1: an exclusive store takes 10% of the net', () => {
    const builder = makeGeneric(false);
    builder.addLine(product(2000));
    builder.addFee(percentFee(10));
    const order = builder.getSnapshot();
    expect(order.fees![0]).toMatchObject({ amountMinor: 200, taxMicros: '20000000' });
    displayIdentity(order);
  });

  it('G2: an inclusive store takes 10% of the gross', () => {
    const builder = makeGeneric(true);
    builder.addLine(product(2200));
    builder.addFee(percentFee(10));
    const order = builder.getSnapshot();
    expect(order.fees![0].amountMinor).toBe(220);
    displayIdentity(order);
  });
});

describe('vendurepos gap 2.10: a percent fee finalized', () => {
  // Copied from command-v5.test.ts (its P cases' wooFee and options).
  const options = { capabilities: { orderCreate: 5 }, now: new Date('2026-10-06T10:00:00.000Z') };
  const finalize = (builder: OrderBuilder) => {
    builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
    return finalizeOrder(builder.getSnapshot(), options);
  };

  it('F1: the stored fee has its fixed amount and no percent', () => {
    const { builder } = x1();
    displayIdentity(builder.getSnapshot());
    const stored = finalize(builder).fees![0];
    expect(stored).not.toHaveProperty('percent');
    expect(stored.amountMinor).toBe(200);
  });

  it('F2: a percent fee in its own mode is stored in the order\'s mode', () => {
    const { builder } = m1();
    displayIdentity(builder.getSnapshot());
    const stored = finalize(builder).fees![0];
    expect(stored).not.toHaveProperty('percent');
    expect(stored).not.toHaveProperty('amountIncludesTax');
    expect(stored.amountMinor).toBe(242);
  });
});

describe('vendurepos gap 2.10: a return line and a percent fee (ADR-063 caps the return line at 0)', () => {
  const cart = (inclusive: boolean, returnAmount?: number) => {
    const builder = make([rate(1, '10.0000')], inclusive);
    add(builder, 1000);
    if (returnAmount !== undefined) add(builder, returnAmount, 'r');
    builder.addFee(percentFee(10));
    return builder.getSnapshot();
  };

  it.each([['P1: an exclusive store', false], ['P2: an inclusive store', true]])('%s: a return line of -3000 leaves the fee at 100', (_, inclusive) => {
    // ADR-063: a return line settles at 0 today, so the fee's basis is the sale lines; if refunds change that, the percent block needs a floor (front desk, 2026-11-19).
    const order = cart(inclusive, -3000);
    expect(order.fees![0].amountMinor).toBe(100);
    expect(order.lineItems[1].netMinor).toBe(0);
    expect(order.totalMinor).toBe(cart(inclusive).totalMinor);
    displayIdentity(order);
  });

  it('P3: a return line of -1000 leaves the fee at 100', () => {
    // ADR-063: a return line settles at 0 today, so the fee's basis is the sale lines; if refunds change that, the percent block needs a floor (front desk, 2026-11-19).
    const order = cart(false, -1000);
    expect(order.fees![0].amountMinor).toBe(100);
    displayIdentity(order);
  });
});

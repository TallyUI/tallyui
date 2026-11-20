import { describe, expect, it } from 'vitest';
import { couponPricingBasis, createOrderBuilder } from '../order/order-builder';
import type { Order } from '../order/types';
import { roundMicrosToMinor, roundedTaxByRate } from '../tax/exact';
import type { TaxContext } from '../tax/types';
import { pickedUnitsMinor, splitUnitLines } from './split-units';

const taxContext: TaxContext = {
  pricesIncludeTax: false,
  getTaxRatePpm: () => 100000,
  rounding: { granularity: 'per_order', mode: 'half_away_from_zero' },
};

describe('splitUnitLines', () => {
  it('S1: uses inclusive netMinor after line and allocated order discounts', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext: { ...taxContext, pricesIncludeTax: true } });
    const first = builder.addLine({ productId: 'a', name: 'A', unitPrice: { amount: 1000, currency: 'USD' }, quantity: 2 });
    builder.addLine({ productId: 'b', name: 'B', unitPrice: { amount: 1500, currency: 'USD' } });
    builder.applyLineDiscount(first, { type: 'fixed', value: 200 });
    builder.applyOrderDiscount({ type: 'fixed', value: 100 });
    const order = builder.getSnapshot();
    expect(order.lineItems[0].discounts).toHaveLength(1);
    expect(order.lineItems[1].orderDiscountMinor).toBeGreaterThan(0);
    const lines = splitUnitLines(order);
    expect(lines).toEqual(order.lineItems.map((li) => ({ id: li.id, quantity: li.quantity, totalMinor: li.netMinor })));
    expect(lines.reduce((sum, li) => sum + li.totalMinor, 0)).toBe(order.totalMinor);
  });

  it('S2: telescopes three exclusive 10.5-minor tax shares to 347', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    for (const productId of ['a', 'b', 'c']) {
      builder.addLine({ productId, name: productId, unitPrice: { amount: 105, currency: 'USD' } });
    }
    const order = builder.getSnapshot();
    expect(order.totalMinor).toBe(347);
    const figures = splitUnitLines(order).map((li) => li.totalMinor);
    expect(figures).toEqual([116, 115, 116]);
    expect(figures.reduce((sum, figure) => sum + figure, 0)).toBe(order.totalMinor);
  });

  it('S3: keeps fees and shipping outside line figures and within the remaining balance', () => {
    const orders = [false, true].map((withCharges) => {
      const builder = createOrderBuilder({ currency: 'USD', taxContext });
      for (const productId of ['a', 'b', 'c']) {
        builder.addLine({ productId, name: productId, unitPrice: { amount: 105, currency: 'USD' } });
      }
      if (withCharges) {
        builder.addFee({ name: 'Fee', amountMinor: 105 });
        builder.addShipping({ name: 'Shipping', amountMinor: 55 });
      }
      return builder.getSnapshot();
    });
    const figures = orders.map((order) => splitUnitLines(order).map((li) => li.totalMinor));
    expect(figures[1]).toEqual(figures[0]);
    const charges = [...orders[1].fees!, ...orders[1].shipping!];
    expect(charges.every((charge) => BigInt(charge.taxMicros) > 0n)).toBe(true);
    expect(figures[1].reduce((sum, figure) => sum + figure, 0))
      .toBeLessThanOrEqual(orders[1].totalMinor - charges.reduce((sum, charge) => sum + charge.netMinor, 0));
  });

  it('S4: rounds a discounted per_line_items line as separate base and tax items', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext: {
      ...taxContext, rounding: { granularity: 'per_line_items', mode: 'half_up' },
    } });
    const id = builder.addLine({ productId: 'a', name: 'A', unitPrice: { amount: 105, currency: 'USD' } });
    builder.addLine({ productId: 'b', name: 'B', unitPrice: { amount: 105, currency: 'USD' } });
    builder.applyLineDiscount(id, { type: 'fixed', value: 5 });
    const order = builder.getSnapshot();
    const figures = splitUnitLines(order).map((li) => li.totalMinor);
    expect(figures).toEqual(order.lineItems.map((li) => {
      const rounded = roundedTaxByRate([li], order.taxRounding)!;
      return rounded.baseMinor + rounded.taxMinor;
    }));
    expect(figures).toEqual([111, 116]);
    expect(figures.reduce((sum, figure) => sum + figure, 0)).toBe(order.totalMinor);
  });

  it('S5: stays within the number of exclusive rate groups of the per_rate_group_items total', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext: {
      ...taxContext, rounding: { granularity: 'per_rate_group_items', mode: 'half_up' },
      getTaxRatePpm: (taxClass) => taxClass === 'reduced' ? 50000 : 100000,
    } });
    for (const [index, taxClass] of ['standard', 'reduced', 'standard', 'reduced'].entries()) {
      builder.addLine({ productId: String(index), name: taxClass, taxClass, unitPrice: { amount: 105, currency: 'USD' } });
    }
    const order = builder.getSnapshot();
    expect(order.lineItems.every((li) => !li.taxInclusive)).toBe(true);
    const groups = roundedTaxByRate(order.lineItems, order.taxRounding)!.rates.length;
    expect(groups).toBe(2);
    const total = splitUnitLines(order).reduce((sum, li) => sum + li.totalMinor, 0);
    expect(Math.abs(total - order.totalMinor)).toBeLessThanOrEqual(groups);
    expect(splitUnitLines(order).map((li) => li.totalMinor)).toEqual([116, 110, 115, 111]);
    expect(total).toBe(order.totalMinor);
  });

  it.each([false, true])('S6: prices converted lines in their own mode (store inclusive: %s)', (pricesIncludeTax) => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext: { ...taxContext, pricesIncludeTax } });
    for (const [index, taxInclusive] of [false, true, false].entries()) {
      builder.addLine({ productId: String(index), name: 'Item', unitPrice: { amount: 105, currency: 'USD', taxInclusive } });
    }
    const order = builder.getSnapshot();
    expect(order.lineItems[pricesIncludeTax ? 0 : 1].priceTaxModeConverted)
      .toBe(pricesIncludeTax ? 'exclusive-to-inclusive' : 'inclusive-to-exclusive');
    const figures = splitUnitLines(order).map((li) => li.totalMinor);
    expect(figures).toEqual([116, order.lineItems[1].netMinor, 115]);
    expect(figures.reduce((sum, figure) => sum + figure, 0)).toBe(order.totalMinor);
  });

  it.each([
    [false, false], [false, true], [true, false], [true, true],
  ])('S7: uses WooCommerce totalMinor after a coupon (inclusive: %s, subtotal: %s)', (pricesIncludeTax, roundAtSubtotal) => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext: {
      ...taxContext, pricesIncludeTax, rounding: { granularity: 'woocommerce', roundAtSubtotal },
      getTaxRates: () => [{ id: 1, code: 'tax', label: 'Tax', rate: '10.0000', priority: 1, compound: false, shipping: true }],
    } });
    for (const productId of ['1', '2', '3']) {
      builder.addLine({ productId, name: productId, unitPrice: { amount: 105, currency: 'USD' } });
    }
    builder.setCoupons(['save'], {
      configs: new Map([['save', { discount_type: 'fixed_cart', amount: '0.03', limit_usage_to_x_items: null,
        product_ids: [], excluded_product_ids: [], product_categories: [], excluded_product_categories: [], exclude_sale_items: false }]]),
      couponIds: new Map([['save', '1']]), productCategories: new Map(), calcDiscountsSequentially: false,
    });
    const order = builder.getSnapshot();
    expect(order.coupons![0].discountMinor).toBeGreaterThan(0);
    expect(order.lineItems.every((li) => li.netMicros !== undefined && li.totalMinor !== undefined)).toBe(true);
    const figures = splitUnitLines(order).map((li) => li.totalMinor);
    expect(figures).toEqual(order.lineItems.map((li) => li.totalMinor));
    if (!roundAtSubtotal) expect(figures.reduce((sum, figure) => sum + figure, 0)).toBe(order.totalMinor);
  });

  it('S8(a): drops a hand-built negative figure', () => {
    const order: Pick<Order, 'lineItems' | 'pricesIncludeTax' | 'taxRounding'> = {
      pricesIncludeTax: true,
      lineItems: [1000, -500].map((netMinor, index) => ({
        id: String(index), productId: String(index), name: 'Item', sku: '', quantity: 1,
        unitPriceMinor: netMinor, netMinor, taxInclusive: true, taxMicros: '0', taxLines: [],
        discounts: [], discountMinor: 0, orderDiscountMinor: 0,
      })),
    };
    expect(splitUnitLines(order)).toEqual([{ id: '0', quantity: 1, totalMinor: 1000 }]);
  });

  it('S8(b): keeps a builder-capped negative-priced return with a zero figure', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext: { ...taxContext, pricesIncludeTax: true } });
    const id = builder.addLine({ productId: 'return', name: 'Return', unitPrice: { amount: -500, currency: 'USD' } });
    const order = builder.getSnapshot();
    expect(order.lineItems[0].netMinor).toBe(0);
    expect(splitUnitLines(order)).toEqual([{ id, quantity: 1, totalMinor: 0 }]);
  });

  it('S8(c): uses netMinor with the store-priced coupon already removed', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext: { ...taxContext, pricesIncludeTax: true } });
    const id = builder.addLine({ productId: 'a', name: 'A', unitPrice: { amount: 1000, currency: 'USD' } });
    builder.setCoupons(['save'], {
      kind: 'store-priced', basis: couponPricingBasis(builder.getSnapshot()),
      priced: new Map([['save', { couponId: '1', lines: [{ lineId: id, amountMinor: 200 }] }]]),
    });
    const order = builder.getSnapshot();
    expect(order.lineItems[0].netMinor).toBe(800);
    expect(splitUnitLines(order)).toEqual([{ id, quantity: 1, totalMinor: order.lineItems[0].netMinor }]);
  });

  it('S9: prices every unit of S2 at 347 through pickedUnitsMinor', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    for (const productId of ['a', 'b', 'c']) {
      builder.addLine({ productId, name: productId, unitPrice: { amount: 105, currency: 'USD' } });
    }
    const order = builder.getSnapshot();
    const picks = Object.fromEntries(order.lineItems.map((li) => [li.id, li.quantity]));
    expect(pickedUnitsMinor(splitUnitLines(order), picks, {})).toBe(347);
  });

  it('S10: telescopes exclusive tax in mixed per_rate_group_items orders', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext: {
      ...taxContext, pricesIncludeTax: false, rounding: { granularity: 'per_rate_group_items', mode: 'half_up' },
    } });
    for (const [index, taxInclusive] of [false, true, false].entries()) {
      builder.addLine({ productId: String(index), name: 'Item', unitPrice: { amount: 105, currency: 'USD', taxInclusive } });
    }
    const order = builder.getSnapshot();
    expect(roundedTaxByRate(order.lineItems, order.taxRounding)).toBeUndefined();
    const figures = splitUnitLines(order).map((li) => li.totalMinor);
    expect(figures).toEqual([116, order.lineItems[1].netMinor, 115]);
    expect(figures.reduce((sum, figure) => sum + figure, 0)).toBe(order.totalMinor);
  });

  it('S11: preserves WooCommerce totalMinor when fractional coupon nets round differently', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext: {
      ...taxContext, pricesIncludeTax: false, rounding: { granularity: 'woocommerce', roundAtSubtotal: true },
      getTaxRates: () => [{ id: 1, code: 'tax', label: 'Tax', rate: '10.0000', priority: 1, compound: false, shipping: true }],
    } });
    for (const productId of ['1', '2', '3']) {
      builder.addLine({ productId, name: productId, unitPrice: { amount: 105, currency: 'USD' } });
    }
    builder.setCoupons(['save'], {
      configs: new Map([['save', { discount_type: 'fixed_cart', amount: '0.006', limit_usage_to_x_items: null,
        product_ids: [], excluded_product_ids: [], product_categories: [], excluded_product_categories: [], exclude_sale_items: false }]]),
      couponIds: new Map([['save', '1']]), productCategories: new Map(), calcDiscountsSequentially: false,
    });
    const order = builder.getSnapshot();
    // The first line's 104.4-minor net plus 10.44-minor tax rounds to 115, versus 104 + 10.
    expect(order.lineItems.some((li) => li.totalMinor !== li.netMinor + roundMicrosToMinor(BigInt(li.taxMicros)))).toBe(true);
    const figures = splitUnitLines(order).map((li) => li.totalMinor);
    expect(figures).toEqual(order.lineItems.map((li) => li.totalMinor));
  });
});

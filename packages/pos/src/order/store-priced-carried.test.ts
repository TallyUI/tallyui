import { describe, expect, it } from 'vitest';
import { couponPricingBasis, createOrderBuilder } from './order-builder';

const make = () => createOrderBuilder({ currency: 'EUR', taxContext: {
  pricesIncludeTax: true, getTaxRatePpm: () => 190000,
  rounding: { granularity: 'per_order', mode: 'half_away_from_zero' },
} });

describe('carried store-priced context', () => {
  it('B1 records each coupon’s own priced amounts when two codes price the same lines', () => {
    const builder = make();
    const first = builder.addLine({ productId: 'p1', name: 'Inclusive', unitPrice: { amount: 1190, currency: 'EUR' } });
    const second = builder.addLine({ productId: 'p2', name: 'Exclusive', unitPrice: { amount: 500, currency: 'EUR', taxInclusive: false } });
    builder.setCoupons(['a', 'b'], { kind: 'store-priced', carried: true, basis: couponPricingBasis(builder.getSnapshot()), priced: new Map([
      ['a', { couponId: '1', lines: [{ lineId: first, amountMinor: 100 }, { lineId: second, amountMinor: 50 }] }],
      ['b', { couponId: '2', lines: [{ lineId: first, amountMinor: 40 }, { lineId: second, amountMinor: 20 }] }],
    ]) });
    expect(builder.getSnapshot().coupons!.map(({ carried, lines }) => ({ carried,
      lines: lines!.map(({ lineId, amountMinor }) => ({ lineId, amountMinor })) }))).toStrictEqual([
      { carried: true, lines: [{ lineId: first, amountMinor: 100 }, { lineId: second, amountMinor: 50 }] },
      { carried: true, lines: [{ lineId: first, amountMinor: 40 }, { lineId: second, amountMinor: 20 }] },
    ]);
  });

  it('B2 keeps a non-zero priced amount when both apportioned shares round to zero, only when carried', () => {
    const builder = make();
    const ids = ['p1', 'p2'].map((productId) => builder.addLine({ productId, name: productId, unitPrice: { amount: 2, currency: 'EUR' } }));
    const context = { kind: 'store-priced' as const, basis: couponPricingBasis(builder.getSnapshot()),
      priced: new Map([['c', { couponId: '1', lines: ids.map((lineId) => ({ lineId, amountMinor: 1 })) }]]) };
    builder.setCoupons(['c'], { ...context, carried: true });
    expect(builder.getSnapshot().coupons![0].lines).toStrictEqual([
      { lineId: ids[0], discountMinor: 1, discountTaxMinor: 1, amountMinor: 1 },
      { lineId: ids[1], discountMinor: 0, discountTaxMinor: 0, amountMinor: 1 },
    ]);
    builder.setCoupons(['c'], context);
    expect(builder.getSnapshot().coupons![0]).not.toHaveProperty('carried');
    expect(builder.getSnapshot().coupons![0].lines).toStrictEqual([{ lineId: ids[0], discountMinor: 1, discountTaxMinor: 1 }]);
  });

  it.each([true, undefined] as const)('B3 makes changed quantities stale with carried=%s', (carried) => {
    const builder = make();
    const lineId = builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: 1190, currency: 'EUR' } });
    builder.setCoupons(['c'], { kind: 'store-priced', ...(carried ? { carried } : {}), basis: couponPricingBasis(builder.getSnapshot()),
      priced: new Map([['c', { couponId: '1', lines: [{ lineId, amountMinor: 100 }] }]]) });
    expect(builder.getSnapshot().couponPricesStale).toBeUndefined();
    builder.updateQuantity(lineId, 2);
    expect(builder.getSnapshot().couponPricesStale).toBe(true);
  });
});

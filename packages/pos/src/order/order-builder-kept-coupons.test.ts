import { describe, expect, it } from 'vitest';
import { couponPricingBasis, createOrderBuilder, type KeptCouponContext } from './order-builder';
import type { Order } from './types';

const taxContext = { getTaxRatePpm: () => 200000, pricesIncludeTax: false, rounding: { granularity: 'per_order' as const, mode: 'half_away_from_zero' as const } };

/** A generic exclusive sale: one 10.00 line, store-priced coupon 'a' at `amountMinor`, a captured 500 cash leg. */
function paidSale(amountMinor = 100) {
  const builder = createOrderBuilder({ currency: 'GBP', taxContext });
  const line = builder.addLine({ id: 'line-1', productId: '10', name: 'Shirt', unitPrice: { amount: 1000, currency: 'GBP' } });
  builder.setCoupons(['a'], { kind: 'store-priced', basis: couponPricingBasis(builder.getSnapshot()),
    priced: new Map([['a', { couponId: 'id-a', lines: [{ lineId: line, amountMinor }] }]]) });
  const leg = builder.addPayment({ method: 'cash', amountMinor: 500 });
  return { builder, line, leg, parked: builder.getSnapshot() };
}
/** The kept context restoreOrderDraft builds from a parked order. */
function kept(parked: Order, overrides: Partial<KeptCouponContext> = {}): KeptCouponContext {
  return { kind: 'kept', coupons: parked.coupons!, displayRows: parked.display.coupons!.map(({ amountMinor }) => amountMinor),
    lines: new Map(parked.lineItems.map((li) => [li.id, li])),
    basis: couponPricingBasis(parked), linesBasis: couponPricingBasis({ ...parked, customer: null }), ...overrides };
}

describe('order builder kept coupons (ADR-077 d3, amended 2026-11-19)', () => {
  it('T12: a live leg keeps the kept figures verbatim; without one, or after a line change, they go stale and give no figures', () => {
    const { builder, leg } = paidSale(100);
    // Parked at 250 off: the kept figures differ from the builder's own 100, so only a verbatim copy matches.
    const other = paidSale(250).parked;
    builder.setCoupons(['a'], kept(other));
    let order = builder.getSnapshot();
    expect(order.coupons).toEqual(other.coupons);
    expect(order.coupons?.[0].discountMinor).toBe(250);
    expect(order.lineItems.map(({ netMinor, netMicros, totalMinor, taxLines }) => ({ netMinor, netMicros, totalMinor, taxLines })))
      .toEqual(other.lineItems.map(({ netMinor, netMicros, totalMinor, taxLines }) => ({ netMinor, netMicros, totalMinor, taxLines })));
    expect(order.display).toEqual(other.display);
    expect(order.totalMinor).toBe(other.totalMinor);
    expect(order).not.toHaveProperty('couponPricesStale');

    builder.removePayment(leg);
    order = builder.getSnapshot();
    expect(order.couponPricesStale).toBe(true);
    expect(order.coupons).toBeUndefined();
    expect(order.lineItems[0].netMinor).toBe(1000);

    const second = paidSale();
    second.builder.setCoupons(['a'], kept(second.parked));
    expect(() => second.builder.updateQuantity(second.line, 2)).not.toThrow();
    order = second.builder.getSnapshot();
    expect(order.couponPricesStale).toBe(true);
    expect(order.coupons).toBeUndefined();
    expect(order.lineItems[0].netMinor).toBe(2000);
  });

  it('T13: setCoupons refuses kept coupons with other codes or an unknown line id, leaving the snapshot unchanged', () => {
    const { builder, parked } = paidSale();
    expect(() => builder.setCoupons(['b'], kept(parked))).toThrow(RangeError);
    expect(builder.getSnapshot()).toEqual(parked);
    const unknown = kept(parked, { lines: new Map([['no-such-line', parked.lineItems[0]]]) });
    expect(() => builder.setCoupons(['a'], unknown)).toThrow(RangeError);
    expect(builder.getSnapshot()).toEqual(parked);
    const [first] = parked.coupons!;
    const unknownCouponLine = kept(parked, { coupons: [{ ...first, lines: [{ lineId: 'no-such-line', amountMinor: 100 }] }] });
    expect(() => builder.setCoupons(['a'], unknownCouponLine)).toThrow(RangeError);
    expect(builder.getSnapshot()).toEqual(parked);
  });
});

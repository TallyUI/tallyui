import { describe, expect, it, vi } from 'vitest';
import { couponPricingBasis, createOrderBuilder, type OrderBuilder, type StorePricedCoupon } from '../order';
import type { TaxContext } from '../tax/types';
import { COUPONS_NEED_CONNECTION, type SaleDiscountState } from './discount-codes';
import { createStorePricedDiscountCodes, type StorePricedAccepted, type StorePricedDiscountCodesOptions } from './store-priced-discount-codes';

const taxContext: TaxContext = { getTaxRatePpm: () => 200000, pricesIncludeTax: false, rounding: { granularity: 'per_order', mode: 'half_away_from_zero' } };
function sale() {
  const builder = createOrderBuilder({ currency: 'GBP', taxContext });
  const line = builder.addLine({ productId: 'p1', name: 'Shirt', unitPrice: { amount: 1000, currency: 'GBP' } });
  return { builder, line };
}
function state(builder: OrderBuilder, accepted: ReadonlyMap<string, StorePricedAccepted> = new Map()): SaleDiscountState<StorePricedAccepted> {
  return { order: builder.getSnapshot(), accepted: new Map(accepted), categories: new Map(), settings: {} };
}
const coupon = (couponId: string, lineId: string, amountMinor: number): StorePricedCoupon => ({ couponId, lines: [{ lineId, amountMinor }] });
type Price = StorePricedDiscountCodesOptions['price'];

/** Applies `codes` one at a time through find and apply, as useSale does; `amounts` is each code's amount on the line. */
async function applyAll(builder: OrderBuilder, line: string, amounts: Record<string, number>) {
  const price = vi.fn<Price>(async (codes) => ({ priced: new Map(codes.map((code) => [code, coupon(`id-${code}`, line, amounts[code])])) }));
  const discountCodes = createStorePricedDiscountCodes({ price });
  const accepted = new Map<string, StorePricedAccepted>();
  for (const code of Object.keys(amounts)) {
    const result = await discountCodes.find(code, state(builder, accepted));
    if (!('found' in result)) throw new Error(result.refusal);
    accepted.set(code, result.found);
    discountCodes.apply(builder, state(builder, accepted));
  }
  return { discountCodes, accepted, price };
}

describe('createStorePricedDiscountCodes (#710)', () => {
  it('prices the accepted codes then the new one, on the basis taken before the call', async () => {
    const { builder, line } = sale();
    const { accepted } = await applyAll(builder, line, { a: 100 });
    const before = couponPricingBasis(builder.getSnapshot());
    let release!: () => void;
    const price = vi.fn<Price>(async (codes) => {
      await new Promise<void>((resolve) => { release = resolve; });
      return { priced: new Map(codes.map((code) => [code, coupon(code, line, 50)])) };
    });
    const asked = state(builder, accepted);
    const finding = createStorePricedDiscountCodes({ price }).find('b', asked);
    builder.updateQuantity(line, 3);
    asked.order = builder.getSnapshot(); // the sale moved on while the store was pricing
    release();
    const result = await finding;
    expect(price).toHaveBeenCalledWith(['a', 'b'], expect.objectContaining({ accepted }));
    expect(result).toMatchObject({ found: { coupon: coupon('b', line, 50), pricing: { codes: ['a', 'b'], basis: before } } });
    expect(before).not.toBe(couponPricingBasis(builder.getSnapshot()));
  });

  it('refuses an applied code without asking the store', async () => {
    const { builder, line } = sale();
    const { accepted } = await applyAll(builder, line, { a: 100 });
    const price = vi.fn<Price>();
    expect(await createStorePricedDiscountCodes({ price }).find('a', state(builder, accepted))).toEqual({ refusal: 'Coupon a is already applied' });
    expect(price).not.toHaveBeenCalled();
  });

  it('gives a transient refusal when the store cannot be reached', async () => {
    const { builder } = sale();
    const price = vi.fn<Price>(async () => { throw new Error('offline'); });
    expect(await createStorePricedDiscountCodes({ price }).find('a', state(builder))).toEqual({ refusal: COUPONS_NEED_CONNECTION, transient: true });
  });

  it("returns the store's refusal as it is", async () => {
    const { builder } = sale();
    const price = vi.fn<Price>(async () => ({ refusal: 'Promotion A has ended' }));
    expect(await createStorePricedDiscountCodes({ price }).find('a', state(builder))).toEqual({ refusal: 'Promotion A has ended' });
  });

  it('refuses when the store leaves a code unpriced', async () => {
    const { builder, line } = sale();
    const { accepted } = await applyAll(builder, line, { a: 100 });
    const price = vi.fn<Price>(async () => ({ priced: new Map([['b', coupon('b', line, 50)]]) }));
    expect(await createStorePricedDiscountCodes({ price }).find('b', state(builder, accepted))).toEqual({ refusal: 'Coupon a was not priced by the store' });
  });

  it("applies the store's amounts, not stale, when the last pricing covers the accepted codes", async () => {
    const { builder, line } = sale();
    await applyAll(builder, line, { a: 100, b: 200 });
    const order = builder.getSnapshot();
    expect(order.coupons).toEqual([expect.objectContaining({ code: 'a', couponId: 'id-a', discountMinor: 100 }),
      expect.objectContaining({ code: 'b', couponId: 'id-b', discountMinor: 200 })]);
    expect(order).not.toHaveProperty('couponPricesStale');
  });

  it('keeps only the remaining codes, stale, after a removal', async () => {
    const { builder, line } = sale();
    const { discountCodes, accepted } = await applyAll(builder, line, { a: 100, b: 200 });
    accepted.delete('a');
    discountCodes.apply(builder, state(builder, accepted));
    const order = builder.getSnapshot();
    expect(order.coupons?.map((entry) => entry.code)).toEqual(['b']);
    expect(order.couponPricesStale).toBe(true);
  });

  it('removes every coupon, not stale, when no codes are left', async () => {
    const { builder, line } = sale();
    const { discountCodes } = await applyAll(builder, line, { a: 100 });
    builder.updateQuantity(line, 2);
    expect(builder.getSnapshot().couponPricesStale).toBe(true);
    discountCodes.apply(builder, state(builder));
    expect(builder.getSnapshot().coupons ?? []).toEqual([]);
    expect(builder.getSnapshot()).not.toHaveProperty('couponPricesStale');
  });

  it('checks nothing itself', () => {
    const { builder, line } = sale();
    const found = { coupon: coupon('a', line, 1), pricing: { codes: ['a'], priced: new Map(), basis: '' } };
    expect(createStorePricedDiscountCodes({ price: vi.fn<Price>() }).check('a', found, state(builder))).toBeNull();
  });
});

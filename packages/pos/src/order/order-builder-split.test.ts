import { describe, it, expect } from 'vitest';
import type { ProductTraits } from '@tallyui/core';
import { createOrderBuilder, SPLIT_FIXED_DISCOUNT } from './order-builder';
import type { TaxContext } from '../tax/types';

// A plain (non-WooCommerce) tax context: 10% exclusive.
const taxContext: TaxContext = { getTaxRatePpm: () => 100000, pricesIncludeTax: false };

const traits = {
  getId: (doc) => doc.id,
  getName: (doc) => doc.name,
  getSku: (doc) => doc.sku ?? '',
  getPrices: (doc, context) => [{ amount: doc.price, currency: context?.currency ?? 'USD', kind: 'base' }],
  getImageUrl: (doc) => doc.imageUrl,
  isSellable: () => true,
} as Partial<ProductTraits> as ProductTraits;

const coffee = { id: 'p1', name: 'Coffee', sku: 'COF-1', price: 1000, imageUrl: 'https://img.test/coffee.png' };
const tea = { id: 'p2', name: 'Tea', sku: 'TEA-1', price: 500 };

function builderWith(quantity: number) {
  const builder = createOrderBuilder({ currency: 'USD', taxContext });
  const lineId = builder.addProduct(coffee, traits, { quantity });
  return { builder, lineId };
}

describe('OrderBuilder.splitLine', () => {
  it('splits a quantity-3 line with a 10% discount into 3 lines of 1, keeping the total', () => {
    const { builder, lineId } = builderWith(3);
    builder.applyLineDiscount(lineId, { type: 'percentage', value: 10 });
    const before = builder.getSnapshot();
    const created = builder.splitLine(lineId);
    const after = builder.getSnapshot();
    expect(created).toHaveLength(2);
    expect(after.lineItems.map((line) => line.id)).toEqual([lineId, ...created]);
    expect(after.lineItems.map((line) => line.quantity)).toEqual([1, 1, 1]);
    for (const line of after.lineItems) {
      expect(line).toMatchObject({ productId: 'p1', sku: 'COF-1', imageUrl: coffee.imageUrl, unitPriceMinor: 1000, netMinor: 900 });
      expect(line.discounts).toMatchObject([{ type: 'percentage', value: 10, amountMinor: 100 }]);
    }
    const discountIds = after.lineItems.map((line) => line.discounts[0].id);
    expect(new Set(discountIds).size).toBe(3);
    expect(after.lineItems).toHaveLength(3);
    expect(after.totalMinor).toBe(before.totalMinor);
    expect(after.totalMinor).toBe(2970);
  });

  it('keeps the line order: A (2) and B split at A give A, A′, B', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext });
    const a = builder.addProduct(coffee, traits, { quantity: 2 });
    const b = builder.addProduct(tea, traits);
    const [aPrime] = builder.splitLine(a);
    expect(builder.getSnapshot().lineItems.map((line) => line.id)).toEqual([a, aPrime, b]);
  });

  it('refuses a line with a fixed discount and leaves the order unchanged', () => {
    const { builder, lineId } = builderWith(3);
    builder.applyLineDiscount(lineId, { type: 'fixed', value: 300 });
    const before = structuredClone(builder.getSnapshot());
    expect(() => builder.splitLine(lineId)).toThrow(new RangeError(SPLIT_FIXED_DISCOUNT));
    expect(builder.getSnapshot()).toEqual(before);
  });

  it('returns [] and emits nothing for a quantity-1 line or an unknown id', () => {
    const { builder, lineId } = builderWith(1);
    let emissions = 0;
    const subscription = builder.order$.subscribe(() => { emissions++; });
    const subscribed = emissions;
    expect(builder.splitLine(lineId)).toEqual([]);
    expect(builder.splitLine('missing')).toEqual([]);
    expect(emissions).toBe(subscribed);
    subscription.unsubscribe();
  });

  it('emits once for a split', () => {
    const { builder, lineId } = builderWith(4);
    let emissions = 0;
    const subscription = builder.order$.subscribe(() => { emissions++; });
    const subscribed = emissions;
    builder.splitLine(lineId);
    expect(emissions - subscribed).toBe(1);
    subscription.unsubscribe();
  });

  it('leaves ordinary lines: adding the product again merges into exactly one of them', () => {
    const { builder, lineId } = builderWith(3);
    builder.splitLine(lineId);
    builder.addProduct(coffee, traits);
    const lines = builder.getSnapshot().lineItems;
    expect(lines).toHaveLength(3);
    expect(lines.map((line) => line.quantity).sort()).toEqual([1, 1, 2]);
  });
});

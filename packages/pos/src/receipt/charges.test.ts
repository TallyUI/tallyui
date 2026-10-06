import { expect, it } from 'vitest';
import { createOrderBuilder } from '../order';
import { buildReceiptData } from './build-receipt-data';

it('returns empty receipt charge arrays when the order omits them', () => {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: {
    pricesIncludeTax: false, getTaxRatePpm: () => 200000,
  } });
  const order = builder.getSnapshot();
  expect(order).not.toHaveProperty('fees');
  expect(order.display).not.toHaveProperty('shipping');
  expect(buildReceiptData(order, { storeName: 'Shop' })).toMatchObject({ fees: [], shipping: [] });
});

it.each([false, true])('includes fee and shipping display rows and their tax (inclusive: %s)', (pricesIncludeTax) => {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: {
    pricesIncludeTax, getTaxRatePpm: (taxClass) => taxClass === 'zero' ? 0 : 200000,
  } });
  builder.addLine({ productId: 'p', name: 'Product', unitPrice: { amount: 1000, currency: 'EUR' }, taxClass: 'zero' });
  builder.addFee({ name: 'Service', amountMinor: 120 });
  builder.addShipping({ name: 'Post', amountMinor: 240, methodId: 'post' });
  builder.applyOrderDiscount({ type: 'percentage', value: 10 });
  const receipt = buildReceiptData(builder.getSnapshot(), { storeName: 'Shop' });
  expect(receipt.fees).toEqual([{ name: 'Service', amountMinor: 120 }]);
  expect(receipt.shipping).toEqual([{ name: 'Post', amountMinor: 240 }]);
  expect(receipt.totals).toEqual({
    taxInclusive: pricesIncludeTax, subtotalMinor: 1000, discountMinor: 100,
    taxMinor: pricesIncludeTax ? 60 : 72, totalMinor: pricesIncludeTax ? 1260 : 1332,
    taxLines: [{ label: 'Tax 0%', code: undefined, ratePpm: 0, amountMinor: 0 },
      { label: 'Tax 20%', code: undefined, ratePpm: 200000, amountMinor: pricesIncludeTax ? 60 : 72 }],
  });
});

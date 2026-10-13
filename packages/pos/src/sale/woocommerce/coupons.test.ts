import { describe, expect, it } from 'vitest';
import { createOrderBuilder } from '../../order';
import { couponLineItems, couponRefusal } from './coupons';

describe('couponRefusal', () => {
  it.each([
    ['already_applied', 'Coupon ten is already applied'],
    ['expired', 'Coupon ten has expired'],
    ['usage_limit_reached', 'Coupon ten has reached its usage limit'],
    ['usage_limit_reached_for_customer', 'This customer has used coupon ten as often as it allows'],
    ['minimum_spend_not_met', 'Coupon ten needs a spend of at least 25.00'],
    ['maximum_spend_exceeded', 'Coupon ten allows a spend of at most 25.00'],
    ['individual_use', 'Coupon ten cannot be used with other coupons'],
    ['individual_use_conflict', 'Coupon solo cannot be used with other coupons'],
    ['email_required', 'Coupon ten needs a customer with an email address'],
    ['email_not_allowed', "This customer's email address cannot use coupon ten"],
    ['not_applicable_to_cart', 'Coupon ten does not apply to anything in this sale'],
  ] as const)('%s', (code, message) => {
    expect(couponRefusal('ten', { code, params: { amount: '25.00', code: 'solo' } })).toBe(message);
  });
});

describe('couponLineItems', () => {
  const builder = createOrderBuilder({ currency: 'GBP', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 0 } });
  builder.addLine({ productId: '10', name: 'Shirt', unitPrice: { amount: 1250, currency: 'GBP' }, quantity: 2 });
  const line = builder.getSnapshot().lineItems[0];

  it('uses major units, preserves input indices, copies categories and marks only sale prices', () => {
    const categories = new Map([[10, [{ id: 7 }]], [0, [{ id: 9 }]]]);
    const lines = [
      { ...line, regularUnitPriceMinor: 1500 },
      { ...line, unitPriceMinor: -100 },
      { ...line, custom: true as const, regularUnitPriceMinor: 1250 },
      { ...line, regularUnitPriceMinor: 1000 },
      line,
    ];
    expect(couponLineItems(lines, 'GBP', categories)).toEqual([
      { product_id: 10, quantity: 2, price: 12.5, subtotal: '25.00', total: '25.00', categories: [{ id: 7 }], on_sale: true, lineIndex: 0 },
      { product_id: 0, quantity: 2, price: 12.5, subtotal: '25.00', total: '25.00', categories: [{ id: 9 }], on_sale: false, lineIndex: 2 },
      { product_id: 10, quantity: 2, price: 12.5, subtotal: '25.00', total: '25.00', categories: [{ id: 7 }], on_sale: false, lineIndex: 3 },
      { product_id: 10, quantity: 2, price: 12.5, subtotal: '25.00', total: '25.00', categories: [{ id: 7 }], on_sale: false, lineIndex: 4 },
    ]);
    expect(couponLineItems(lines, 'GBP', categories)[0].categories).not.toBe(categories.get(10));
  });

  it.each(['custom:1', '-1', '1.5', '9007199254740992'])('maps unsafe product id %s to zero', (productId) => {
    expect(couponLineItems([{ ...line, productId }], 'GBP', new Map())[0]).toMatchObject({ product_id: 0, categories: [] });
  });
});

import { describe, expect, it } from 'vitest';
import { cartQuantities } from './in-cart';

describe('cartQuantities', () => {
  it("sums a product's quantities across its variant lines", () => {
    const quantities = cartQuantities([
      { productId: 'shirt', quantity: 2 },
      { productId: 'hat', quantity: 1 },
      { productId: 'shirt', quantity: 1 },
    ]);
    expect(quantities.get('shirt')).toBe(3);
    expect(quantities.get('hat')).toBe(1);
  });

  it('ignores custom lines', () => {
    const quantities = cartQuantities([{ productId: 'hat', quantity: 1 }, { productId: 'hat', quantity: 4, custom: true }]);
    expect(quantities.get('hat')).toBe(1);
  });

  it('returns an empty map for no lines', () => {
    expect(cartQuantities([]).size).toBe(0);
  });
});

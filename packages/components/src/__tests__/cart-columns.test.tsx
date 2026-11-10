import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CartColumnHeads, cartShowsPrice } from '../cart/cart-columns';

const heads = () => screen.getAllByRole('columnheader').map((head) => head.textContent);

describe('CartColumnHeads', () => {
  it("renders v2's heads Qty, Item, Price, Total in order", () => {
    render(<CartColumnHeads />);
    expect(heads()).toEqual(['Qty', 'Item', 'Price', 'Total']);
  });

  it('drops the Price head when showPrice is false', () => {
    render(<CartColumnHeads showPrice={false} />);
    expect(heads()).toEqual(['Qty', 'Item', 'Total']);
  });
});

describe('cartShowsPrice', () => {
  it.each([
    [undefined, 1024, 768, true],
    [300, 1024, 768, true],
    [299, 1024, 768, false],
    [400, 767, 1024, false],
    [400, 1024, 479, false],
  ])('cart %s wide in a %s × %s window: %s', (cartWidth, windowWidth, windowHeight, shows) => {
    expect(cartShowsPrice({ cartWidth, windowWidth, windowHeight })).toBe(shows);
  });
});

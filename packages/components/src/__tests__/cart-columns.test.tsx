import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CartColumnHeads, cartColumnIds, cartShowsPrice } from '../cart/cart-columns';

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

describe('cartColumnIds', () => {
  it("defaults to today's columns", () => {
    expect(cartColumnIds()).toEqual(['quantity', 'name', 'price', 'total']);
  });

  it('lists every shown column in the fixed order, and drops Price without showPrice', () => {
    const all = { quantity: { show: true }, image: { show: true }, name: { show: true }, sku: { show: true }, price: { show: true }, total: { show: true } };
    expect(cartColumnIds(all)).toEqual(['quantity', 'image', 'name', 'sku', 'price', 'total']);
    expect(cartColumnIds(all, { showPrice: false })).toEqual(['quantity', 'image', 'name', 'sku', 'total']);
  });
});

describe('CartColumnHeads columns', () => {
  it('heads the Image column with an empty label and the SKU column with SKU', () => {
    render(<CartColumnHeads columns={{ image: { show: true }, sku: { show: true }, quantity: { show: false } }} />);
    expect(heads()).toEqual(['', 'Item', 'SKU', 'Price', 'Total']);
  });

  it('has no Item head when name is hidden', () => {
    render(<CartColumnHeads columns={{ name: { show: false } }} />);
    expect(heads()).toEqual(['Qty', 'Price', 'Total']);
  });
});

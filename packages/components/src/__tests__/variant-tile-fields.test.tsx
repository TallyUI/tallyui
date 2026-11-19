import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VariantTile } from '../product/variant-tile';

// vendurepos gap 9.9c: the drill's variant tile follows the grid's Tile Fields (v2 variation-tile.tsx:136,180).
afterEach(() => cleanup());

function mount(props: Partial<ComponentProps<typeof VariantTile>> = {}) {
  render(<VariantTile testID="vt" name="Tee" chips={['Red', 'L']} price="€20.00" stockStatus="in_stock" onPress={vi.fn()} {...props} />);
}
const tile = () => screen.getByTestId('vt');
const text = () => tile().textContent ?? '';

describe('VariantTile fields', () => {
  it('V1: by default shows the name, both chips, the price and the stock, no SKU and no tile label', () => {
    mount({ sku: 'T-RED' });
    expect(text()).toContain('Tee');
    expect(screen.getByTestId('vt-chips').textContent).toBe('RedL');
    expect(text()).toContain('€20.00');
    expect(text()).toContain('In Stock');
    expect(text()).not.toContain('SKU');
    expect(tile().getAttribute('aria-label')).toBeNull();
  });

  it('V2: with name off, no name and no chips; the tile is labelled with the name and chips', () => {
    mount({ fields: { name: false } });
    expect(text()).not.toContain('Tee');
    expect(screen.queryByTestId('vt-chips')).toBeNull();
    expect(tile().getAttribute('aria-label')).toBe('Tee, Red, L');
  });

  it('V3: with price off, no price shows', () => {
    mount({ fields: { price: false } });
    expect(text()).not.toContain('€20.00');
    expect(text()).toContain('In Stock');
  });

  it('V4: SKU then barcode after the price; no SKU prop draws no SKU; categories draw nothing', () => {
    mount({ fields: { sku: true, barcode: true, categories: true }, sku: 'T-RED', barcode: '123' });
    const words = text();
    const sku = words.indexOf('SKU T-RED');
    expect(sku).toBeGreaterThan(words.indexOf('€20.00'));
    expect(words.indexOf('123')).toBeGreaterThan(sku);
    expect(words).toBe('TeeRedL€20.00SKU T-RED123In Stock');
    cleanup();
    mount({ fields: { sku: true, barcode: true }, barcode: '123' });
    expect(text()).not.toContain('SKU');
    expect(text()).toContain('123');
  });

  it('V5: with stock off, in stock shows nothing, out of stock still shows, unless price is off too', () => {
    mount({ fields: { stock: false } });
    expect(text()).not.toContain('In Stock');
    cleanup();
    mount({ fields: { stock: false }, stockStatus: 'out_of_stock' });
    expect(text()).toContain('Out of Stock');
    cleanup();
    mount({ fields: { stock: false, price: false }, stockStatus: 'out_of_stock' });
    expect(text()).not.toContain('Out of Stock');
  });
});

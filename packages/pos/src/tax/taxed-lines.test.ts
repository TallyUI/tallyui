import { describe, expect, it } from 'vitest';
import { taxedLinesFor } from './taxed-lines';

describe('taxedLinesFor', () => {
  it.each([false, true])('uses the store mode %s for WooCommerce lines with netMicros', (pricesIncludeTax) => {
    expect(taxedLinesFor([{ netMicros: '1000000', taxInclusive: !pricesIncludeTax }], [], pricesIncludeTax,
      { granularity: 'woocommerce', roundAtSubtotal: false })).toEqual([
      { netMicros: '1000000', taxInclusive: pricesIncludeTax },
    ]);
  });

  it.each([false, true])('keeps the line mode under WooCommerce without netMicros, store mode %s', (pricesIncludeTax) => {
    expect(taxedLinesFor([{ taxInclusive: !pricesIncludeTax }], [], pricesIncludeTax,
      { granularity: 'woocommerce', roundAtSubtotal: false })).toEqual([{ taxInclusive: !pricesIncludeTax }]);
  });

  it.each([false, true])('keeps the line mode under per_order, store mode %s', (pricesIncludeTax) => {
    expect(taxedLinesFor([{ netMicros: '1000000', taxInclusive: !pricesIncludeTax }], [], pricesIncludeTax,
      { granularity: 'per_order', mode: 'half_away_from_zero' })).toEqual([
      { netMicros: '1000000', taxInclusive: !pricesIncludeTax },
    ]);
  });

  it.each([false, true])('uses the store mode %s when the line has no mode', (pricesIncludeTax) => {
    expect(taxedLinesFor([{ netMicros: '1000000' }], [], pricesIncludeTax)).toEqual([
      { netMicros: '1000000', taxInclusive: pricesIncludeTax },
    ]);
  });

  it.each([false, true])('uses the store mode %s for charges', (pricesIncludeTax) => {
    expect(taxedLinesFor([], [{ name: 'Fee', taxInclusive: !pricesIncludeTax }, { name: 'Shipping' }], pricesIncludeTax)).toEqual([
      { name: 'Fee', taxInclusive: pricesIncludeTax }, { name: 'Shipping', taxInclusive: pricesIncludeTax },
    ]);
  });

  it('keeps lines then charges in order and preserves extra fields', () => {
    expect(taxedLinesFor([
      { name: 'First line', taxInclusive: true, quantity: 2 },
      { name: 'Second line', taxInclusive: false, quantity: 1 },
    ], [
      { name: 'Fee', netMinor: 3 }, { name: 'Shipping', netMinor: 4 },
    ], false)).toEqual([
      { name: 'First line', taxInclusive: true, quantity: 2 },
      { name: 'Second line', taxInclusive: false, quantity: 1 },
      { name: 'Fee', netMinor: 3, taxInclusive: false },
      { name: 'Shipping', netMinor: 4, taxInclusive: false },
    ]);
  });
});

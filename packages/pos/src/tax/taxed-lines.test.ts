import { describe, expect, it } from 'vitest';
import { recordedTaxByRate, taxedLinesFor } from './taxed-lines';
import { taxedLinesFor as entryTaxedLinesFor } from '../index';

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

  it.each([false, true])('T1: keeps a charge\'s own amountIncludesTax outside WooCommerce, store mode %s', (pricesIncludeTax) => {
    const fee = { name: 'Fee', amountIncludesTax: !pricesIncludeTax };
    expect(taxedLinesFor([], [fee], pricesIncludeTax)).toEqual([{ ...fee, taxInclusive: !pricesIncludeTax }]);
    expect(taxedLinesFor([], [fee], pricesIncludeTax, { granularity: 'woocommerce', roundAtSubtotal: false }))
      .toEqual([{ ...fee, taxInclusive: pricesIncludeTax }]);
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

describe('recordedTaxByRate', () => {
  const taxByRate = [{ ratePpm: 200000, amountMinor: 1 }];

  it.each([false, true])('refuses a WooCommerce split for a converted line with taxInclusive %s', (taxInclusive) => {
    expect(recordedTaxByRate({ taxByRate, lines: [{ netMicros: '1000000', taxInclusive }],
      taxRounding: { granularity: 'woocommerce', roundAtSubtotal: false } })).toBeUndefined();
  });

  it('keeps a WooCommerce split when netMicros lines have no stored tax mode', () => {
    expect(recordedTaxByRate({ taxByRate, lines: [{ netMicros: '1000000' }],
      taxRounding: { granularity: 'woocommerce', roundAtSubtotal: false } })).toBe(taxByRate);
  });

  it('keeps a per_order split for a line with a stored tax mode', () => {
    expect(recordedTaxByRate({ taxByRate, lines: [{ netMicros: '1000000', taxInclusive: true }],
      taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' } })).toBe(taxByRate);
  });

  it('keeps a split without taxRounding', () => {
    expect(recordedTaxByRate({ taxByRate, lines: [{ netMicros: '1000000', taxInclusive: true }] })).toBe(taxByRate);
  });

  it('returns undefined without taxByRate', () => {
    expect(recordedTaxByRate({ lines: [] })).toBeUndefined();
  });
});

describe('taxedLinesFor from the package entry', () => {
  it('is the same function as the module export', () => {
    expect(entryTaxedLinesFor).toBe(taxedLinesFor);
  });

  it('keeps a fee amountIncludesTax unless the store rounds as WooCommerce does', () => {
    const fee = { name: 'Fee', amountMinor: 500, amountIncludesTax: true };
    expect(entryTaxedLinesFor([], [fee], false)).toEqual([{ ...fee, taxInclusive: true }]);
    expect(entryTaxedLinesFor([], [fee], false, { granularity: 'woocommerce', roundAtSubtotal: false })).toEqual([
      { ...fee, taxInclusive: false },
    ]);
  });
});

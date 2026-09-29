import { describe, expect, it } from 'vitest';
import { knownWarnings } from './known-warnings';

describe('knownWarnings', () => {
  it('keeps a total_mismatch without bridgeMinor', () => {
    const warning = { code: 'total_mismatch', expectedMinor: 1200, serverMinor: 1000 };
    expect(knownWarnings([warning])).toEqual([warning]);
  });

  it('keeps a total_mismatch with bridgeMinor', () => {
    const warning = { code: 'total_mismatch', expectedMinor: 1200, serverMinor: 1195, bridgeMinor: 5 };
    expect(knownWarnings([warning])).toEqual([warning]);
  });

  it('keeps an insufficient_stock warning', () => {
    const warning = { code: 'insufficient_stock', variantId: 'blue', quantity: 1 };
    expect(knownWarnings([warning])).toEqual([warning]);
  });

  it('keeps a tax_rate_mismatch warning', () => {
    const warning = { code: 'tax_rate_mismatch', ratePpm: 200000, expectedMinor: 120, serverMinor: 100 };
    expect(knownWarnings([warning])).toEqual([warning]);
  });

  it('drops an unknown code', () => {
    expect(knownWarnings([{ code: 'future_code', foo: 'bar' }])).toEqual([]);
  });

  it.each([
    { code: 'total_mismatch', expectedMinor: 1200, serverMinor: '1' },
    { code: 'total_mismatch', expectedMinor: 1200, serverMinor: 1000, bridgeMinor: 1.5 },
    { code: 'insufficient_stock', variantId: 'blue', quantity: 0 },
    { code: 'insufficient_stock', variantId: '', quantity: 1 },
    { code: 'tax_rate_mismatch', ratePpm: 200000, expectedMinor: 120, serverMinor: '1' },
  ])('drops a known code with a wrong field type: %j', (warning) => {
    expect(knownWarnings([warning])).toEqual([]);
  });

  it.each([null, [], 'x'])('drops a non-object %j', (item) => {
    expect(knownWarnings([item])).toEqual([]);
  });

  it('strips extra fields', () => {
    const warning = { code: 'insufficient_stock', variantId: 'blue', quantity: 1, extra: 'nope' };
    expect(knownWarnings([warning])).toEqual([{ code: 'insufficient_stock', variantId: 'blue', quantity: 1 }]);
  });

  it('returns [] for undefined', () => {
    expect(knownWarnings(undefined)).toEqual([]);
  });

  it('keeps order', () => {
    const stock = { code: 'insufficient_stock', variantId: 'blue', quantity: 1 };
    const total = { code: 'total_mismatch', expectedMinor: 1200, serverMinor: 1000 };
    const tax = { code: 'tax_rate_mismatch', ratePpm: 200000, expectedMinor: 120, serverMinor: 100 };
    expect(knownWarnings([stock, total, tax])).toEqual([stock, total, tax]);
  });
});

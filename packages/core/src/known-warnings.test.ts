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
    { code: 'insufficient_stock', variantId: 'blue', quantity: 0 },
    { code: 'insufficient_stock', variantId: '', quantity: 1 },
    { code: 'tax_rate_mismatch', ratePpm: 200000, expectedMinor: 120, serverMinor: '1' },
  ])('drops a known code with a wrong field type: %j', (warning) => {
    expect(knownWarnings([warning])).toEqual([]);
  });

  it.each([null, [], 'x'])('drops a non-object %j', (item) => {
    expect(knownWarnings([item])).toEqual([]);
  });

  it.each([{}, 'x', null])('returns [] for a non-array value: %j', (value) => {
    expect(knownWarnings(value)).toEqual([]);
  });

  it.each([
    { bridgeMinor: null, label: 'null' },
    { bridgeMinor: 1.5, label: 'not a safe integer' },
    { bridgeMinor: 0, label: 'zero' },
    { bridgeMinor: 3, label: "inconsistent with expectedMinor - serverMinor" },
  ])('keeps a total_mismatch without bridgeMinor when it is $label', ({ bridgeMinor }) => {
    const warning = { code: 'total_mismatch', expectedMinor: 1200, serverMinor: 1195, bridgeMinor };
    expect(knownWarnings([warning])).toEqual([{ code: 'total_mismatch', expectedMinor: 1200, serverMinor: 1195 }]);
  });

  it('drops a tax_rate_mismatch with a negative ratePpm', () => {
    const warning = { code: 'tax_rate_mismatch', ratePpm: -1, expectedMinor: 120, serverMinor: 100 };
    expect(knownWarnings([warning])).toEqual([]);
  });

  it('keeps a tax_rate_mismatch with ratePpm: 0', () => {
    const warning = { code: 'tax_rate_mismatch', ratePpm: 0, expectedMinor: 120, serverMinor: 100 };
    expect(knownWarnings([warning])).toEqual([warning]);
  });

  it('keeps a customer_ignored warning', () => {
    const warning = { code: 'customer_ignored', customerId: 'cus_1' };
    expect(knownWarnings([warning])).toEqual([warning]);
  });

  it('keeps a customer_ignored without its extra reason', () => {
    const warning = { code: 'customer_ignored', customerId: 'cus_1', reason: 'unknown' };
    expect(knownWarnings([warning])).toEqual([{ code: 'customer_ignored', customerId: 'cus_1' }]);
  });

  it.each(['', 'c'.repeat(65), 1, null, undefined])('drops a customer_ignored with customerId %j', (customerId) => {
    expect(knownWarnings([{ code: 'customer_ignored', customerId }])).toEqual([]);
  });

  it('keeps a customer_ignored with a 64-character customerId', () => {
    const warning = { code: 'customer_ignored', customerId: 'c'.repeat(64) };
    expect(knownWarnings([warning])).toEqual([warning]);
  });

  const subtotal = { field: 'subtotalMinor', tillMinor: 1050, serverMinor: 1000 };
  const tax = { field: 'taxMinor', tillMinor: 210, serverMinor: 200 };
  const discount = { field: 'discountMinor', tillMinor: 0, serverMinor: 50 };

  it('keeps a figures_mismatch with one entry, and with three', () => {
    const one = { code: 'figures_mismatch', fields: [subtotal] };
    const three = { code: 'figures_mismatch', fields: [subtotal, tax, discount] };
    expect(knownWarnings([one, three])).toEqual([one, three]);
  });

  it.each([
    ['an empty fields', []],
    ['a non-array fields', { 0: subtotal }],
    ['an empty field name', [{ ...subtotal, field: '' }]],
    ['a non-string field name', [{ ...subtotal, field: 1 }]],
    ['a repeated field name', [subtotal, { ...subtotal, tillMinor: 1100 }]],
    ['a non-integer tillMinor', [subtotal, { ...tax, tillMinor: 210.5 }]],
    ['a non-integer serverMinor', [{ ...tax, serverMinor: '200' }]],
    ['equal values', [subtotal, { ...tax, serverMinor: 210 }]],
    ['a non-object entry', [subtotal, null]],
  ])('drops a whole figures_mismatch with %s', (_label, fields) => {
    expect(knownWarnings([{ code: 'figures_mismatch', fields }])).toEqual([]);
  });

  it('keeps a figures_mismatch entry whose field name it does not know, from a newer store', () => {
    const warning = { code: 'figures_mismatch', fields: [subtotal, { field: 'grandTotalMinor', tillMinor: 100, serverMinor: 200 }] };
    expect(knownWarnings([warning])).toEqual([warning]);
  });

  it('drops extra keys in a figures_mismatch entry', () => {
    const warning = { code: 'figures_mismatch', fields: [{ ...tax, currency: 'EUR' }], extra: 1 };
    expect(knownWarnings([warning])).toEqual([{ code: 'figures_mismatch', fields: [tax] }]);
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

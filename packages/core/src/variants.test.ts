import { describe, expect, it } from 'vitest';
import type { VariantSummary } from './types';
import { findVariantByCode } from './variants';

describe('findVariantByCode', () => {
  const variants: VariantSummary[] = [
    { id: 'small', barcode: ' BAR-S ', sku: ' SKU-S ', prices: [], stock: { status: 'in_stock' } },
    { id: 'large', barcode: 'SKU-S', sku: 'SKU-L', prices: [], stock: { status: 'unknown' } },
  ];

  it('finds by barcode', () => {
    expect(findVariantByCode(variants, 'BAR-S')).toBe(variants[0]);
  });

  it('finds by SKU', () => {
    expect(findVariantByCode(variants, 'SKU-L')).toBe(variants[1]);
  });

  it('prefers a barcode match over another variant’s SKU match', () => {
    expect(findVariantByCode(variants, 'SKU-S')).toBe(variants[1]);
  });

  it.each(['bar-s', 'sku-s'])('trims both sides and ignores case for %s', (code) => {
    expect(findVariantByCode([variants[0]], ` ${code} `)).toBe(variants[0]);
  });

  it.each(['barcode', 'sku'] as const)('returns the first of several %s matches', (field) => {
    const matches = variants.map((variant) => ({ ...variant, [field]: 'same' }));
    expect(findVariantByCode(matches, 'same')).toBe(matches[0]);
  });

  it.each(['', '   ', 'missing'])('returns undefined for %j', (code) => {
    expect(findVariantByCode(variants, code)).toBeUndefined();
  });

  it('returns undefined without variants or codes', () => {
    expect(findVariantByCode([], 'BAR-S')).toBeUndefined();
    expect(findVariantByCode([{ id: 'empty', prices: [], stock: { status: 'unknown' } }], 'BAR-S'))
      .toBeUndefined();
  });
});

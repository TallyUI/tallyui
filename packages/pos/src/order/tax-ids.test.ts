import { describe, expect, it } from 'vitest';
import type { CustomerTaxId } from '@tallyui/core';
import { cleanTaxIds } from './tax-ids';

describe('cleanTaxIds (#1064)', () => {
  it('T1: trims every field and upper-cases the country', () => {
    expect(cleanTaxIds([{ type: ' eu_vat ', value: ' DE1 ', country: ' de ' }])).toStrictEqual([{ type: 'eu_vat', value: 'DE1', country: 'DE' }]);
  });

  it('drops an empty country or label', () => {
    expect(cleanTaxIds([{ type: 'eu_vat', value: 'DE1', country: '  ', label: ' ' }])).toStrictEqual([{ type: 'eu_vat', value: 'DE1' }]);
  });

  it.each<[string, CustomerTaxId]>([
    ['a 33-character type', { type: 't'.repeat(33), value: 'DE1' }],
    ['a 65-character value', { type: 'eu_vat', value: 'v'.repeat(65) }],
    ['a NUL in the value', { type: 'eu_vat', value: 'DE\u00001' }],
    ['a NUL in the type', { type: 'eu\u0000vat', value: 'DE1' }],
    ['an empty type', { type: ' ', value: 'DE1' }],
    ['an empty value', { type: 'eu_vat', value: '' }],
    ['a 256-character label', { type: 'eu_vat', value: 'DE1', label: 'l'.repeat(256) }],
  ])('T2: refuses %s', (_name, taxId) => {
    expect(cleanTaxIds([taxId])).toBeNull();
  });

  it('T2: keeps a type of 32 and a value of 64 characters', () => {
    expect(cleanTaxIds([{ type: 't'.repeat(32), value: 'v'.repeat(64), label: 'l'.repeat(255) }])).toHaveLength(1);
  });

  it('T3: refuses the same type and value twice, compared after cleaning', () => {
    expect(cleanTaxIds([{ type: 'eu_vat', value: 'DE1' }, { type: 'eu_vat', value: ' DE1' }])).toBeNull();
    expect(cleanTaxIds([{ type: 'eu_vat', value: 'DE1' }, { type: 'gb_vat', value: 'DE1' }])).toHaveLength(2);
  });

  it('T4: takes 10 entries and refuses 11', () => {
    const list = (n: number) => Array.from({ length: n }, (_, i) => ({ type: 'other', value: `ID${i}` }));
    expect(cleanTaxIds(list(10))).toStrictEqual(list(10));
    expect(cleanTaxIds(list(11))).toBeNull();
  });

  it.each(['DEU', 'D1'])('T5: refuses the country %s', (country) => {
    expect(cleanTaxIds([{ type: 'eu_vat', value: 'DE1', country }])).toBeNull();
  });

  it('T6: leaves its input unchanged and returns new objects', () => {
    const input: CustomerTaxId[] = [{ type: ' eu_vat', value: 'DE1', country: 'de', label: 'VAT' }, { type: 'us_ein', value: '12-3' }];
    const copy = structuredClone(input);
    const cleaned = cleanTaxIds(input)!;
    expect(input).toStrictEqual(copy);
    expect(cleaned).not.toBe(input);
    cleaned.forEach((taxId, i) => expect(taxId).not.toBe(input[i]));
    expect(cleaned[1]).toStrictEqual(input[1]);
  });
});

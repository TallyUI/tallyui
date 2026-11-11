import { describe, expect, it } from 'vitest';
import type { VariantOptionGroup, VariantSummary } from '@tallyui/core';
import { disabledOptions, matchVariant, variantFits } from './variant-match';

const variant = (id: string, options?: Record<string, string>): VariantSummary =>
  ({ id, options, prices: [], stock: { status: 'in_stock' } });
const groups: VariantOptionGroup[] = [
  { name: 'Size', values: ['S', 'M', 'L'] },
  { name: 'Colour', values: ['Red', 'Blue'] },
];
const sRed = variant('s-red', { Size: 'S', Colour: 'Red' });
const sBlue = variant('s-blue', { Size: 'S', Colour: 'Blue' });
const mRed = variant('m-red', { Size: 'M', Colour: 'Red' });
const lAny = variant('l-any', { Size: 'L' });
const tee = [sRed, sBlue, mRed, lAny];

describe('matchVariant', () => {
  it('gives the variant for complete picks, and undefined for no fit or incomplete picks', () => {
    expect(matchVariant(tee, groups, { Size: 'M', Colour: 'Red' })).toBe(mRed);
    expect(matchVariant(tee, groups, { Size: 'M', Colour: 'Blue' })).toBeUndefined();
    expect(matchVariant(tee, groups, { Size: 'M' })).toBeUndefined();
    expect(matchVariant(tee, groups, {})).toBeUndefined();
  });

  it('gives the Any variant for a value it leaves open', () => {
    expect(matchVariant(tee, groups, { Size: 'L', Colour: 'Blue' })).toBe(lAny);
  });

  it('prefers a variant whose own value matches over an earlier Any one', () => {
    const sAny = variant('s-any', { Size: 'S' });
    expect(matchVariant([sAny, sRed], groups, { Size: 'S', Colour: 'Red' })).toBe(sRed);
    expect(matchVariant([sAny, sRed], groups, { Size: 'S', Colour: 'Blue' })).toBe(sAny);
  });

  it('gives a tie to the first variant in order', () => {
    const lAnyToo = variant('l-any-too', { Size: 'L' });
    expect(matchVariant([lAny, lAnyToo], groups, { Size: 'L', Colour: 'Blue' })).toBe(lAny);
    expect(matchVariant([lAnyToo, lAny], groups, { Size: 'L', Colour: 'Blue' })).toBe(lAnyToo);
  });
});

describe('disabledOptions', () => {
  it("disables the values no variant allows given the other groups' picks", () => {
    const byM = disabledOptions(tee, groups, { Size: 'M' });
    expect([...byM.Colour]).toEqual(['Blue']);
    expect([...byM.Size]).toEqual([]);
    const byBlue = disabledOptions(tee, groups, { Colour: 'Blue' });
    expect([...byBlue.Size]).toEqual(['M']);
    expect([...byBlue.Colour]).toEqual([]);
    expect([...disabledOptions(tee, groups, {}).Size]).toEqual([]);
  });
});

describe('variantFits', () => {
  it('fits a variant with options undefined only to empty picks', () => {
    const bare = variant('bare');
    expect(variantFits(bare, {})).toBe(true);
    expect(variantFits(bare, { Size: 'S' })).toBe(false);
    expect(matchVariant([bare], groups, { Size: 'S', Colour: 'Red' })).toBeUndefined();
  });

  it('fits an Any group to every value', () => {
    expect(variantFits(lAny, { Size: 'L', Colour: 'Red' })).toBe(true);
    expect(variantFits(lAny, { Size: 'M' })).toBe(false);
  });
});

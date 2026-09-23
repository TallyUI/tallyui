import { describe, it, expect } from 'vitest';
import {
  MICROS_PER_MINOR,
  ratePpmFromPercent,
  taxMicros,
  roundMicrosToMinor,
  computeOrderTax,
} from './exact';

describe('exact tax', () => {
  it('converts percentages to integer ppm', () => {
    expect(ratePpmFromPercent(19)).toBe(190000);
    expect(ratePpmFromPercent('19')).toBe(190000);
    expect(ratePpmFromPercent(7.25)).toBe(72500);
    expect(ratePpmFromPercent('0.1')).toBe(1000);
    expect(ratePpmFromPercent(0)).toBe(0);
    expect(() => ratePpmFromPercent(-1)).toThrow(RangeError);
    expect(() => ratePpmFromPercent('abc')).toThrow(RangeError);
  });

  it('computes exact exclusive line tax in micro-minor-units', () => {
    expect(MICROS_PER_MINOR).toBe(1_000_000n);
    expect(taxMicros(150, 190000, false)).toBe(28_500_000n);
    expect(taxMicros(105, 190000, false)).toBe(19_950_000n);
    expect(taxMicros(5, 190000, false)).toBe(950_000n);
  });

  it('rounds inclusive line tax to the nearest micro-minor-unit', () => {
    expect(taxMicros(1190, 190000, true)).toBe(190_000_000n);
    expect(taxMicros(100, 190000, true)).toBe(15_966_387n);
  });

  it('rounds micro-minor-units half away from zero', () => {
    expect(roundMicrosToMinor(28_500_000n)).toBe(29);
    expect(roundMicrosToMinor(-28_500_000n)).toBe(-29);
    expect(roundMicrosToMinor(28_499_999n)).toBe(28);
    expect(roundMicrosToMinor(0n)).toBe(0);
    expect(roundMicrosToMinor(-28_499_999n)).toBe(-28);
    expect(roundMicrosToMinor(-1n)).toBe(0);
  });

  it('matches Medusa vector A: 3.094 EUR paid as 3.09', () => {
    expect(computeOrderTax([
      { unitPriceMinor: 150, quantity: 1, ratePpm: 190000 },
      { unitPriceMinor: 35, quantity: 3, ratePpm: 190000 },
      { unitPriceMinor: 5, quantity: 1, ratePpm: 190000 },
    ], false)).toEqual({
      subtotalMinor: 260, taxMinor: 49, totalMinor: 309,
      lineTaxMicros: [28_500_000n, 19_950_000n, 950_000n],
    });
  });

  it('matches Medusa vector B: order #301', () => {
    expect(computeOrderTax([
      { unitPriceMinor: 850, quantity: 2, ratePpm: 190000 },
      { unitPriceMinor: 1200, quantity: 1, ratePpm: 190000 },
    ], false)).toEqual({
      subtotalMinor: 2900, taxMinor: 551, totalMinor: 3451,
      lineTaxMicros: [323_000_000n, 228_000_000n],
    });
  });

  it('rounds tax once across four lines, not per line', () => {
    expect(computeOrderTax([
      { unitPriceMinor: 3, quantity: 1, ratePpm: 190000 },
      { unitPriceMinor: 3, quantity: 1, ratePpm: 190000 },
      { unitPriceMinor: 3, quantity: 1, ratePpm: 190000 },
      { unitPriceMinor: 3, quantity: 1, ratePpm: 190000 },
    ], false)).toEqual({
      subtotalMinor: 12, taxMinor: 2, totalMinor: 14,
      lineTaxMicros: [570_000n, 570_000n, 570_000n, 570_000n],
    });
  });

  it('computes inclusive order totals', () => {
    expect(computeOrderTax([
      { unitPriceMinor: 1190, quantity: 1, ratePpm: 190000 },
    ], true)).toEqual({
      subtotalMinor: 1000, taxMinor: 190, totalMinor: 1190,
      lineTaxMicros: [190_000_000n],
    });
  });

  it('computes an order with mixed rates', () => {
    expect(computeOrderTax([
      { unitPriceMinor: 1000, quantity: 1, ratePpm: 190000 },
      { unitPriceMinor: 1000, quantity: 1, ratePpm: 70000 },
    ], false)).toEqual({
      subtotalMinor: 2000, taxMinor: 260, totalMinor: 2260,
      lineTaxMicros: [190_000_000n, 70_000_000n],
    });
  });

  it('returns zeros and no line taxes for an empty order', () => {
    for (const inclusive of [false, true]) {
      expect(computeOrderTax([], inclusive)).toEqual({
        subtotalMinor: 0, taxMinor: 0, totalMinor: 0, lineTaxMicros: [],
      });
    }
  });

  it('rejects quantity zero and a fractional unit price', () => {
    expect(() => computeOrderTax([
      { unitPriceMinor: 100, quantity: 0, ratePpm: 190000 },
    ], false)).toThrow(RangeError);
    expect(() => computeOrderTax([
      { unitPriceMinor: 1.5, quantity: 1, ratePpm: 190000 },
    ], false)).toThrow(RangeError);
  });

  it('rounds fractional ppm and rejects non-finite percentages', () => {
    expect(ratePpmFromPercent('0.00025')).toBe(3);
    expect(ratePpmFromPercent('0.00016')).toBe(2);
    for (const percent of [NaN, Infinity, -Infinity, 'Infinity']) {
      expect(() => ratePpmFromPercent(percent)).toThrow(RangeError);
    }
  });

  it('rejects invalid amounts, rates and quantities', () => {
    for (const value of [NaN, Infinity, -Infinity, 1.5]) {
      expect(() => taxMicros(value, 190000, false)).toThrow(RangeError);
    }
    for (const value of [NaN, Infinity, -1, 1.5]) {
      expect(() => taxMicros(100, value, true)).toThrow(RangeError);
      expect(() => computeOrderTax([
        { unitPriceMinor: 100, quantity: value, ratePpm: 190000 },
      ], true)).toThrow(RangeError);
      expect(() => computeOrderTax([
        { unitPriceMinor: 100, quantity: 1, ratePpm: value },
      ], false)).toThrow(RangeError);
    }
  });

  it('handles returns and inclusive micro-minor-unit ties half away from zero', () => {
    expect(taxMicros(-150, 190000, false)).toBe(-28_500_000n);
    expect(taxMicros(1, 127000000, true)).toBe(992_188n);
    expect(taxMicros(-1, 127000000, true)).toBe(-992_188n);
    expect(computeOrderTax([
      { unitPriceMinor: -150, quantity: 1, ratePpm: 190000 },
    ], false)).toEqual({
      subtotalMinor: -150, taxMinor: -29, totalMinor: -179,
      lineTaxMicros: [-28_500_000n],
    });
  });

  it('rounds inclusive tax after multiplying the unit price by quantity', () => {
    expect(computeOrderTax([
      { unitPriceMinor: -100, quantity: 3, ratePpm: 190000 },
    ], true)).toEqual({
      subtotalMinor: -252, taxMinor: -48, totalMinor: -300,
      lineTaxMicros: [-47_899_160n],
    });
  });

  it('keeps large products and cancellation exact before producing number totals', () => {
    expect(computeOrderTax([
      { unitPriceMinor: Number.MAX_SAFE_INTEGER, quantity: 3, ratePpm: 1 },
      { unitPriceMinor: -Number.MAX_SAFE_INTEGER, quantity: 3, ratePpm: 1 },
      { unitPriceMinor: 1, quantity: 1, ratePpm: 0 },
    ], false)).toEqual({
      subtotalMinor: 1, taxMinor: 0, totalMinor: 1,
      lineTaxMicros: [27_021_597_764_222_973n, -27_021_597_764_222_973n, 0n],
    });
  });
});

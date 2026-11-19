import { describe, expect, it } from 'vitest';
import {
  paidUnitsByLine,
  pickedUnitsMinor,
  unitsMinor,
  unpaidUnitsByLine,
  type SplitUnitLine,
} from './split-units';

/** Each unit's share: unitsMinor(·, u) − unitsMinor(·, u − 1) for u = 1..quantity. */
const shares = (totalMinor: number, quantity: number) =>
  Array.from(
    { length: quantity },
    (_, i) => unitsMinor(totalMinor, quantity, i + 1) - unitsMinor(totalMinor, quantity, i),
  );
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

describe('unitsMinor', () => {
  it('U1: prices 0..3 units of 1000 over 3 cumulatively, the shares summing to the total', () => {
    expect([0, 1, 2, 3].map((u) => unitsMinor(1000, 3, u))).toEqual([0, 333, 666, 1000]);
    expect(shares(1000, 3)).toEqual([333, 333, 334]);
    expect(sum(shares(1000, 3))).toBe(1000);
  });

  it('U2: gives each of 7 units of 1001 a share of 143, summing to 1001', () => {
    expect(shares(1001, 7)).toEqual([143, 143, 143, 143, 143, 143, 143]);
    expect(sum(shares(1001, 7))).toBe(1001);
  });

  it('U3: shares 100 over 3 units as 33, 33, 34', () => {
    expect(shares(100, 3)).toEqual([33, 33, 34]);
    expect(sum(shares(100, 3))).toBe(100);
  });

  it('U10: prices 0..3 units of 1001 over 3 cumulatively, spreading the stray cents', () => {
    // v2's last-unit form gives 0, 333, 666, 1001: the cumulative floor spreads the 2 stray cents (spec 11a, unit share).
    expect([0, 1, 2, 3].map((u) => unitsMinor(1001, 3, u))).toEqual([0, 333, 667, 1001]);
    expect(shares(1001, 3)).toEqual([333, 334, 334]);
  });

  it.each([
    ['quantity 2.5', 1000, 2.5, 1],
    ['quantity 0', 1000, 0, 0],
    ['units 4 of 3', 1000, 3, 4],
    ['units 1.5', 1000, 3, 1.5],
    ['units -1', 1000, 3, -1],
    ['totalMinor -100', -100, 3, 1],
  ])('U4: throws RangeError on %s', (_, totalMinor, quantity, units) => {
    expect(() => unitsMinor(totalMinor, quantity, units)).toThrow(RangeError);
  });
});

describe('paidUnitsByLine', () => {
  const allocations = { p1: { a: 1 }, p2: { a: 2, b: 1 } };

  it('U5: sums the units of every live payment per line', () => {
    expect(paidUnitsByLine(allocations, ['p1', 'p2'])).toEqual({ a: 3, b: 1 });
  });

  it('U6: frees the units of a payment that is no longer live (p1 voided)', () => {
    expect(paidUnitsByLine(allocations, ['p2'])).toEqual({ a: 2, b: 1 });
  });
});

describe('unpaidUnitsByLine', () => {
  it('U7: counts unpaid units by String(id) and leaves out a fractional line', () => {
    const lines: SplitUnitLine[] = [
      { id: 'a', quantity: 3, totalMinor: 900 },
      { id: 'b', quantity: 1.5, totalMinor: 300 },
      { id: 7, quantity: 2, totalMinor: 200 },
    ];
    expect(unpaidUnitsByLine(lines, { a: 1 })).toEqual({ a: 2, '7': 2 });
  });
});

describe('pickedUnitsMinor', () => {
  const lines: SplitUnitLine[] = [{ id: 'a', quantity: 3, totalMinor: 1000 }];

  it('U8: prices one unit picked after 0, 1 and 2 paid as 333, 333, 334, together 1000', () => {
    const first = pickedUnitsMinor(lines, { a: 1 }, {});
    const second = pickedUnitsMinor(lines, { a: 1 }, { a: 1 });
    const third = pickedUnitsMinor(lines, { a: 1 }, { a: 2 });
    expect(first).toBe(333);
    expect(second).toBe(333);
    expect(third).toBe(334);
    expect(first + second + third).toBe(1000);
  });

  it('U9: throws RangeError on a pick on an unknown line', () => {
    expect(() => pickedUnitsMinor(lines, { z: 1 }, {})).toThrow(RangeError);
  });

  it('U9b: throws RangeError on a pick of 3 when 2 are unpaid', () => {
    expect(() => pickedUnitsMinor(lines, { a: 3 }, { a: 1 })).toThrow(RangeError);
  });

  it('U11: prices the second unit of 3 for 1001 as 334, not v2 last-unit 333', () => {
    const line: SplitUnitLine = { id: 'a', quantity: 3, totalMinor: 1001 };
    expect(pickedUnitsMinor([line], { a: 1 }, { a: 1 })).toBe(334);
  });
});

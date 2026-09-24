import { describe, expect, it } from 'vitest';
import { compareIds } from './compare-ids';

describe('compareIds', () => {
  it('orders integer strings numerically', () => {
    expect(compareIds('9', '10')).toBeLessThan(0);
    expect(compareIds('10', '9')).toBeGreaterThan(0);
  });

  it('orders non-numeric ids by plain string order', () => {
    expect(compareIds('variant_01A', 'variant_01B')).toBeLessThan(0);
  });

  it('returns 0 for equal ids', () => {
    expect(compareIds('9', '9')).toBe(0);
    expect(compareIds('variant_01A', 'variant_01A')).toBe(0);
  });

  it('compares a very long integer string exactly', () => {
    const bigger = '100000000000000000000000000000000000000000000000000000000000001';
    const smaller = '100000000000000000000000000000000000000000000000000000000000000';
    expect(compareIds(bigger, smaller)).toBeGreaterThan(0);
    expect(compareIds(smaller, bigger)).toBeLessThan(0);
  });

  it('gives a consistent total order for mixed numeric and non-numeric ids', () => {
    expect(['10', '9', 'b', 'a'].sort(compareIds)).toEqual(['9', '10', 'a', 'b']);
  });

  it('sorts an integer id before a non-integer one, for every input order (no cycle)', () => {
    for (const ids of permutations(['10', '9', '1a', 'b'])) {
      expect([...ids].sort(compareIds)).toEqual(['9', '10', '1a', 'b']);
    }
  });

  it('breaks ties in numeric value by string order, so equal-value ids are never conflated', () => {
    expect(compareIds('01', '1')).not.toBe(0);
  });

  it('gives a consistent total order for every input order, including ties in numeric value', () => {
    // '0' < '00' and '01' < '1' by plain string order: those ties in BigInt value break by string.
    for (const ids of permutations(['10', '9', '01', '1', '0', '00', '1a', 'b'])) {
      expect([...ids].sort(compareIds)).toEqual(['0', '00', '01', '1', '9', '10', '1a', 'b']);
    }
  });
});

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]));
}

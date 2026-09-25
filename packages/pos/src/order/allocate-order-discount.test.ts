import { describe, expect, it } from 'vitest';
import { allocateOrderDiscount } from './allocate-order-discount';

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

// A seeded generator (mulberry32), so a failing case can be replayed.
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('allocateOrderDiscount', () => {
  it('splits 100 over three equal lines as 34, 33, 33', () => {
    const shares = allocateOrderDiscount([1000, 1000, 1000], 100);
    expect(shares).toEqual([34, 33, 33]);
    expect(sum(shares)).toBe(100);
  });

  it('follows the lines\' proportions', () => {
    expect(allocateOrderDiscount([100, 200, 300], 60)).toEqual([10, 20, 30]);
    expect(allocateOrderDiscount([1000, 2000, 3000], 100)).toEqual([17, 33, 50]);
  });

  it('never gives a line more than its amount', () => {
    expect(allocateOrderDiscount([1, 1, 998], 1000)).toEqual([1, 1, 998]);
    expect(allocateOrderDiscount([1, 1, 1], 2)).toEqual([1, 1, 0]);
    expect(() => allocateOrderDiscount([1, 2], 4)).toThrow(RangeError);
  });

  it('breaks ties towards the earlier line, deterministically', () => {
    expect(allocateOrderDiscount([500, 500], 1)).toEqual([1, 0]);
    expect(allocateOrderDiscount([100, 300, 100, 300], 2)).toEqual([0, 1, 0, 1]);
    expect(allocateOrderDiscount([100, 300, 100, 300], 3)).toEqual([1, 1, 0, 1]);
  });

  it('gives every line 0 for a zero discount, and lines without a positive amount nothing', () => {
    expect(allocateOrderDiscount([100, 200], 0)).toEqual([0, 0]);
    expect(allocateOrderDiscount([], 0)).toEqual([]);
    expect(allocateOrderDiscount([0, -500, 300], 30)).toEqual([0, 0, 30]);
  });

  it('rejects non-integer or negative input', () => {
    expect(() => allocateOrderDiscount([100], 1.5)).toThrow(RangeError);
    expect(() => allocateOrderDiscount([100.5], 1)).toThrow(RangeError);
    expect(() => allocateOrderDiscount([100], -1)).toThrow(RangeError);
  });

  it('always sums exactly and stays within each line\'s amount over 200 random cases', () => {
    const next = random(20260925);
    for (let run = 0; run < 200; run++) {
      const amounts = Array.from({ length: 1 + Math.floor(next() * 8) }, () => Math.floor(next() * 100_000));
      const total = Math.floor(next() * (sum(amounts) + 1));
      const shares = allocateOrderDiscount(amounts, total);
      expect(sum(shares), JSON.stringify({ amounts, total })).toBe(total);
      shares.forEach((share, index) => {
        expect(share).toBeGreaterThanOrEqual(0);
        expect(share).toBeLessThanOrEqual(amounts[index]);
        // Largest remainder: each share is its exact proportion, floored or plus one.
        expect(Math.abs(share - (total && total * amounts[index] / sum(amounts)))).toBeLessThan(1);
      });
    }
  });
});

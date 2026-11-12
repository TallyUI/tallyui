import { describe, expect, it } from 'vitest';
import { apportionLargestRemainders } from './apportion';

describe('apportionLargestRemainders', () => {
  it('splits exact proportions', () => {
    expect(apportionLargestRemainders([1n, 3n], 8, 0)).toEqual([2, 6]);
  });

  it('gives the leftover to the largest fraction', () => {
    expect(apportionLargestRemainders([1n, 1n, 2n], 5, 0)).toEqual([1, 1, 3]);
  });

  it('breaks ties by the lower index', () => {
    expect(apportionLargestRemainders([1n, 1n, 1n], 2, 0)).toEqual([1, 1, 0]);
  });

  it('counts a negative weight as zero', () => {
    expect(apportionLargestRemainders([-5n, 2n], 4, 0)).toEqual([0, 4]);
  });

  it('gives an all-zero split to the fallback', () => {
    expect(apportionLargestRemainders([0n, 0n, 0n], 7, 1)).toEqual([0, 7, 0]);
  });

  it('returns zeros for a zero total even with weights', () => {
    expect(apportionLargestRemainders([3n, 4n], 0, 0)).toEqual([0, 0]);
  });

  it('keeps big weights exact', () => {
    const total = 9_007_199_254_740_991;
    const shares = apportionLargestRemainders([10n ** 18n, 10n ** 18n + 1n], total, 0);
    expect(shares[0] + shares[1]).toBe(total);
    expect(shares[1]).toBe(shares[0] + 1);
  });

  it('rejects a negative total', () => {
    expect(() => apportionLargestRemainders([1n], -1, 0)).toThrow(RangeError);
  });

  it('rejects a fractional total', () => {
    expect(() => apportionLargestRemainders([1n], 1.5, 0)).toThrow(RangeError);
  });

  it('rejects an unsafe total', () => {
    expect(() => apportionLargestRemainders([1n], 2 ** 53, 0)).toThrow(RangeError);
  });

  it('rejects an out-of-range fallback when needed', () => {
    expect(() => apportionLargestRemainders([0n], 1, 1)).toThrow(RangeError);
  });

  it('returns an empty split for an empty input and zero total', () => {
    expect(apportionLargestRemainders([], 0, -1)).toEqual([]);
  });
});

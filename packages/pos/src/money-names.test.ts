import { describe, expect, it } from 'vitest';
import { minorToDecimal } from './index';
import { minorToMajor } from '@tallyui/core';

describe('money converter names', () => {
  it.each([
    [1250, 2],
    [-50, 2],
    [0, 2],
    [1500, 0],
    [12345, 3],
    [-7, 3],
    [999999999, 2],
  ])('matches minorToMajor for %i with %i digits', (minor, exponent) => {
    expect(minorToDecimal(minor, exponent)).toBe(minorToMajor(minor, exponent));
  });
});

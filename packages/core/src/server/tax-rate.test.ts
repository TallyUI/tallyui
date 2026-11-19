// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { ratePpmFromPercent } from '@tallyui/core';
import { ratePpmFromPercent as serverRatePpmFromPercent } from './index';

describe('ratePpmFromPercent', () => {
  it('converts percentages to integer ppm', () => {
    expect(ratePpmFromPercent(19)).toBe(190000);
    expect(ratePpmFromPercent('19')).toBe(190000);
    expect(ratePpmFromPercent(7.25)).toBe(72500);
    expect(ratePpmFromPercent('0.1')).toBe(1000);
    expect(ratePpmFromPercent('0.0001')).toBe(1);
    expect(ratePpmFromPercent(100)).toBe(1000000);
    expect(ratePpmFromPercent('900719925474.0991')).toBe(Number.MAX_SAFE_INTEGER);
    expect(ratePpmFromPercent(0)).toBe(0);
    expect(() => ratePpmFromPercent(-1)).toThrow(RangeError);
    expect(() => ratePpmFromPercent('abc')).toThrow(RangeError);
  });

  it.each([
    '', ' ', '0x10', '1e1', '-1', -1, '19%', '0.00001', '0.00025', '0.00016',
    NaN, Infinity, -Infinity, 'Infinity', 'abc', 1e21, 1e-7,
    '+1', ' 19', '19 ', '19\n', '.1', '1.', '900719925474.0992',
  ])('rejects invalid or unrepresentable percentage %s', (percent) => {
    expect(() => ratePpmFromPercent(percent)).toThrow(RangeError);
  });

  it('exports the same function from the main and server entries', () => {
    expect(ratePpmFromPercent).toBe(serverRatePpmFromPercent);
  });
});

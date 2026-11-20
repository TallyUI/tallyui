import { describe, expect, it } from 'vitest';
import { CustomerServiceError } from '@tallyui/core';
import { medusaMinor, medusaNetMinor, medusaSumMinor } from './money';

describe('Medusa money', () => {
  it('medusaMinor rounds half away from zero exactly', () => {
    for (const [amount, currency, expected] of [
      [1.005, 'EUR', 101], [0.285, 'EUR', 29], [10.075, 'EUR', 1008], [-0.125, 'EUR', -13], [3.094, 'EUR', 309],
      [1200, 'JPY', 1200], [0.1 + 0.2, 'EUR', 30],
    ] as const) {
      expect(medusaMinor(amount, currency)).toBe(expected);
    }
  });

  it('medusaMinor refuses a non-number', () => {
    for (const amount of ['12', Number.NaN, undefined]) {
      expect(() => medusaMinor(amount, 'EUR')).toThrow(expect.objectContaining({ name: 'CustomerServiceError', code: 'server' }));
      expect(() => medusaMinor(amount, 'EUR')).toThrow(CustomerServiceError);
    }
  });

  it('medusaNetMinor subtracts exactly, then rounds once', () => {
    expect(medusaNetMinor(3.094, 0.494, 'EUR')).toBe(260);
    expect(medusaNetMinor(1.785, 0.285, 'EUR')).toBe(150);
  });

  it('medusaSumMinor adds and subtracts exactly, then rounds once', () => {
    expect(medusaSumMinor('EUR', [106.80129, 6])).toBe(11280);
    expect(medusaSumMinor('EUR', [106.80129, 6], [18.01029])).toBe(9479);
  });
});

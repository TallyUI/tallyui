import { describe, expect, it } from 'vitest';
import { moneyInputText } from '../lib/money-input';

const COMMA = { decimalSeparator: ',', thousandSeparator: '.' };

describe('moneyInputText', () => {
  it.each([
    [1250, 'USD', undefined, '12.50'],
    [1250, 'EUR', COMMA, '12,50'],
    [1500, 'KWD', COMMA, '1,500'],
    [500, 'JPY', undefined, '500'],
    [-1250, 'USD', undefined, '-12.50'],
  ] as const)('writes %d %s in %j as %j', (minor, currency, format, expected) => {
    expect(moneyInputText(minor, currency, format)).toBe(expected);
  });
});

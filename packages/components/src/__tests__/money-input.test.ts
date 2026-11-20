import { describe, expect, it } from 'vitest';
import { typeDecimal } from '../input/decimal-entry';
import { moneyInputText, readMoneyText } from '../lib/money-input';

const COMMA = { decimalSeparator: ',', thousandSeparator: '.' };
const APOS = { decimalSeparator: '.', thousandSeparator: "'" };

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

describe('readMoneyText', () => {
  it.each([
    ['1,000', undefined, '1,000'],
    [' 12,5 ', undefined, ' 12,5 '],
    ['1.234,50', COMMA, '1234.50'],
    ['1.234.56', COMMA, undefined],
    ['1,5', APOS, undefined],
  ] as const)('reads %j in %j as %j', (text, format, expected) => {
    expect(readMoneyText(text, format)).toBe(expected);
  });
});

describe('typeDecimal with a comma separator', () => {
  it('adds the comma once, and only with places', () => {
    expect(typeDecimal('12', 'decimal', 2, ',')).toBe('12,');
    expect(typeDecimal('12,', 'decimal', 2, ',')).toBe('12,');
    expect(typeDecimal('', 'decimal', 2, ',')).toBe('0,');
    expect(typeDecimal('12', 'decimal', 0, ',')).toBe('12');
  });

  it('refuses a digit past the places', () => {
    expect(typeDecimal('1,50', '0', 2, ',')).toBe('1,50');
    expect(typeDecimal('1,5', '0', 2, ',')).toBe('1,50');
    expect(typeDecimal('1,500', '1', 3, ',')).toBe('1,500');
  });
});

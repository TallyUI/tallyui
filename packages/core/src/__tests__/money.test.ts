import { describe, it, expect } from 'vitest';
import { minorUnitDigits, moneyFromMajor, moneyToMajor, resolvePrice } from '../money';
import type { ProductPrice } from '../types';

describe('minorUnitDigits', () => {
  it('knows two-digit and zero-digit currencies', () => {
    expect(minorUnitDigits('EUR')).toBe(2);
    expect(minorUnitDigits('usd')).toBe(2);
    expect(minorUnitDigits('JPY')).toBe(0);
  });

  it('assumes two digits for unknown codes', () => {
    expect(minorUnitDigits('XXX')).toBe(2);
  });
});

describe('moneyFromMajor / moneyToMajor', () => {
  it('converts decimal strings and numbers to integer minor units', () => {
    expect(moneyFromMajor('12.50', 'eur')).toEqual({ amount: 1250, currency: 'EUR' });
    expect(moneyFromMajor(19.99, 'USD')).toEqual({ amount: 1999, currency: 'USD' });
    expect(moneyFromMajor('1200', 'JPY')).toEqual({ amount: 1200, currency: 'JPY' });
  });

  it('avoids float drift', () => {
    expect(moneyFromMajor('0.29', 'EUR')?.amount).toBe(29);
    expect(moneyFromMajor(1.005 * 100, 'EUR')?.amount).toBe(10050);
  });

  it('returns undefined for empty or non-numeric input', () => {
    expect(moneyFromMajor('', 'EUR')).toBeUndefined();
    expect(moneyFromMajor(null, 'EUR')).toBeUndefined();
    expect(moneyFromMajor('abc', 'EUR')).toBeUndefined();
  });

  it('round-trips to major units', () => {
    expect(moneyToMajor({ amount: 1250, currency: 'EUR' })).toBe(12.5);
    expect(moneyToMajor({ amount: 1200, currency: 'JPY' })).toBe(1200);
  });
});

describe('resolvePrice', () => {
  const prices: ProductPrice[] = [
    { amount: 2000, currency: 'EUR', kind: 'base' },
    { amount: 2200, currency: 'USD', kind: 'base' },
    { amount: 1599, currency: 'EUR', kind: 'sale' },
  ];

  it('prefers the sale price and reports the base price it replaces', () => {
    expect(resolvePrice(prices, 'EUR')).toEqual({
      current: { amount: 1599, currency: 'EUR' },
      was: { amount: 2000, currency: 'EUR' },
    });
  });

  it('returns the base price when no sale applies in that currency', () => {
    expect(resolvePrice(prices, 'usd')).toEqual({ current: { amount: 2200, currency: 'USD' } });
  });

  it('defaults to the first listed currency', () => {
    expect(resolvePrice(prices)?.current.currency).toBe('EUR');
  });

  it('ignores a sale price that is not lower than the base price', () => {
    const odd: ProductPrice[] = [
      { amount: 1000, currency: 'EUR', kind: 'base' },
      { amount: 1200, currency: 'EUR', kind: 'sale' },
    ];
    expect(resolvePrice(odd)).toEqual({ current: { amount: 1000, currency: 'EUR' } });
  });

  it('returns undefined for an empty list or missing currency', () => {
    expect(resolvePrice([])).toBeUndefined();
    expect(resolvePrice(prices, 'GBP')).toBeUndefined();
  });
});

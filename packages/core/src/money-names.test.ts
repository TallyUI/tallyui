import { describe, expect, it } from 'vitest';
import { minorToMajor, minorUnitDigits, moneyToMajor } from './index';
import { currencyDecimals, minorToMajor as serverMinorToMajor, minorUnitDigits as serverMinorUnitDigits } from './server/index';

describe('money converter names', () => {
  it('exports the same canonical functions from both entry points', () => {
    expect(minorToMajor).toBe(serverMinorToMajor);
    expect(serverMinorUnitDigits).toBe(minorUnitDigits);
  });

  it.each(['EUR', 'USD', 'JPY', 'KWD', 'eur'])('agrees on the minor-unit digits for %s', (currency) => {
    expect(minorUnitDigits(currency)).toBe(currencyDecimals(currency));
  });

  it('uses the expected currency exponents', () => {
    expect(minorUnitDigits('EUR')).toBe(2);
    expect(minorUnitDigits('JPY')).toBe(0);
    expect(minorUnitDigits('KWD')).toBe(3);
  });

  it.each([
    { amount: 1250, currency: 'EUR' },
    { amount: -50, currency: 'EUR' },
    { amount: 0, currency: 'EUR' },
    { amount: 1500, currency: 'JPY' },
    { amount: 12345, currency: 'KWD' },
    { amount: 7, currency: 'USD' },
  ])('agrees with moneyToMajor for $amount $currency', ({ amount, currency }) => {
    expect(Number(minorToMajor(amount, minorUnitDigits(currency)))).toBe(moneyToMajor({ amount, currency }));
  });

  it('returns exact decimal strings', () => {
    expect(minorToMajor(1250, 2)).toBe('12.50');
    expect(minorToMajor(-50, 2)).toBe('-0.50');
    expect(minorToMajor(1500, 0)).toBe('1500');
  });
});

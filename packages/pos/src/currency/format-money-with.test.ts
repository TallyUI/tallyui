import { describe, it, expect } from 'vitest';
import { formatMoneyWith } from './format-money-with';

const usd = (amount: number) => ({ amount, currency: 'USD' });
const eur = (amount: number) => ({ amount, currency: 'EUR' });

describe('formatMoneyWith', () => {
  it('places the symbol by position (v2 currency_pos)', () => {
    expect(formatMoneyWith(usd(123450), { position: 'left' }, 'en')).toBe('$1,234.50');
    expect(formatMoneyWith(usd(123450), { position: 'left_space' }, 'en')).toBe('$ 1,234.50');
    expect(formatMoneyWith(usd(123450), { position: 'right' }, 'en')).toBe('1,234.50$');
    expect(formatMoneyWith(usd(123450), { position: 'right_space' }, 'en')).toBe('1,234.50 $');
  });

  it('uses the given thousand and decimal separators', () => {
    const format = { position: 'right_space', thousandSeparator: '.', decimalSeparator: ',' } as const;
    expect(formatMoneyWith(eur(123450), format, 'de-DE')).toBe('1.234,50 €');
    // es would not group 1234 by itself; the store's separator groups every three digits.
    expect(formatMoneyWith(eur(123450), format, 'es')).toBe('1.234,50 €');
    expect(formatMoneyWith(eur(123456789), format, 'en')).toBe('1.234.567,89 €');
    expect(formatMoneyWith(usd(123450), { thousandSeparator: '' }, 'en')).toBe('$1234.50');
  });

  it('shows the given number of decimals, rounding half away from zero', () => {
    expect(formatMoneyWith(usd(1250), { decimals: 0 }, 'en')).toBe('$13');
    expect(formatMoneyWith(usd(1249), { decimals: 0 }, 'en')).toBe('$12');
    expect(formatMoneyWith(usd(3451), { decimals: 3 }, 'en')).toBe('$34.510');
    expect(formatMoneyWith({ amount: 1200, currency: 'JPY' }, { decimals: 2 }, 'en')).toBe('¥1,200.00');
    expect(formatMoneyWith({ amount: 1200, currency: 'JPY' }, {}, 'en')).toBe('¥1,200');
    const de = { position: 'right_space', thousandSeparator: '.', decimalSeparator: ',', decimals: 0 } as const;
    expect(formatMoneyWith(eur(123450), de, 'de-DE')).toBe('1.235 €');
  });

  it('leads a negative amount with a minus, before the symbol', () => {
    expect(formatMoneyWith(usd(-123450), { position: 'left' }, 'en')).toBe('-$1,234.50');
    const de = { position: 'right_space', thousandSeparator: '.', decimalSeparator: ',' } as const;
    expect(formatMoneyWith(eur(-123450), de, 'de-DE')).toBe('-1.234,50 €');
    expect(formatMoneyWith(usd(-1250), { decimals: 0 }, 'en')).toBe('-$13');
    expect(formatMoneyWith(usd(-4), { decimals: 0 }, 'en')).toBe('$0');
  });

  it("keeps Intl's side and gap when no position is given", () => {
    expect(formatMoneyWith(eur(123450), { decimals: 0 }, 'de-DE')).toBe('1.235 €');
  });

  it('returns undefined for XXX', () => {
    expect(formatMoneyWith({ amount: 3451, currency: 'XXX' }, { position: 'left' }, 'en')).toBeUndefined();
  });
});

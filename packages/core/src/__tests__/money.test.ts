import { describe, it, expect } from 'vitest';
import { formatMoney, minorUnitDigits, moneyFromDecimalString, moneyFromMajor, moneyToMajor, normalizeMoneyText, resolvePrice, resolvePriceRange } from '../money';
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

describe('moneyFromDecimalString', () => {
  it.each([
    ['12', 'EUR', 1200], ['12.5', 'EUR', 1250], ['12.50', 'EUR', 1250],
    ['0.01', 'EUR', 1], ['0.29', 'EUR', 29], [' 3.00 ', 'EUR', 300],
    ['100', 'JPY', 100], ['0001.20', 'EUR', 120], ['0', 'EUR', 0],
    ['90071992547409.91', 'EUR', Number.MAX_SAFE_INTEGER],
    ['9007199254740991', 'JPY', Number.MAX_SAFE_INTEGER],
  ])('parses %s in %s exactly', (text, currency, amount) => {
    expect(moneyFromDecimalString(text, currency)).toEqual({ amount, currency });
  });

  it.each(['', ' ', '-1', '1e2', '1,00', ' 3,00 ', '12.345', '.5', '1.', '+1', '1 2',
    '90071992547409.92', '9007199254740991000000'])('rejects invalid EUR text %s', (text) => {
    expect(moneyFromDecimalString(text, 'EUR')).toBeUndefined();
  });

  it('rejects fractional yen and unsafe integers', () => {
    expect(moneyFromDecimalString('1.5', 'JPY')).toBeUndefined();
    expect(moneyFromDecimalString('1.0', 'JPY')).toBeUndefined();
    expect(moneyFromDecimalString('9007199254740992', 'JPY')).toBeUndefined();
  });
});

describe('formatMoney', () => {
  const usd = (amount: number) => ({ amount, currency: 'USD' });
  const eur = (amount: number) => ({ amount, currency: 'EUR' });

  it.each([
    [{ amount: 1250, currency: 'CAD' }, 'en', { position: 'left', symbol: '$' }, '$12.50'],
    [{ amount: 123450, currency: 'EUR' }, 'en', { position: 'right_space', thousandSeparator: '.', decimalSeparator: ',', symbol: '€' }, '1.234,50 €'],
    [{ amount: -1250, currency: 'ZAR' }, 'en', { position: 'left', symbol: 'R' }, '-R12.50'],
  ] as const)('uses the store symbol: %j', (money, locale, format, expected) => {
    expect(formatMoney(money, locale, format)).toBe(expected);
  });

  it('shows Latin digits and groups them in a non-Latin locale', () => {
    expect(formatMoney({ amount: 123456789, currency: 'USD' }, 'ar-EG', {
      position: 'left', thousandSeparator: ',', decimalSeparator: '.', symbol: '$',
    })).toBe('$1,234,567.89');
  });

  it('shows no Arabic-Indic digits in ar-EG without a thousand separator', () => {
    const result = formatMoney({ amount: 123456789, currency: 'USD' }, 'ar-EG', { position: 'left', symbol: '$' });
    expect(result).not.toMatch(/[٠-٩]/);
    expect(result).toMatch(/^\$1.?234.?567.?89$/u);
  });

  it('treats a position outside the four values as unset', () => {
    const m = { amount: 1250, currency: 'USD' };
    expect(formatMoney(m, 'en', { position: 'middle' as never })).toBe(formatMoney(m, 'en', {}));
  });

  it('places the symbol by position (v2 currency_pos)', () => {
    expect(formatMoney(usd(123450), 'en', { position: 'left' })).toBe('$1,234.50');
    expect(formatMoney(usd(123450), 'en', { position: 'left_space' })).toBe('$ 1,234.50');
    expect(formatMoney(usd(123450), 'en', { position: 'right' })).toBe('1,234.50$');
    expect(formatMoney(usd(123450), 'en', { position: 'right_space' })).toBe('1,234.50 $');
  });

  it('uses the given thousand and decimal separators', () => {
    const format = { position: 'right_space', thousandSeparator: '.', decimalSeparator: ',' } as const;
    expect(formatMoney(eur(123450), 'de-DE', format)).toBe('1.234,50 €');
    // es would not group 1234 by itself; the store's separator groups every three digits.
    expect(formatMoney(eur(123450), 'es', format)).toBe('1.234,50 €');
    expect(formatMoney(eur(123456789), 'en', format)).toBe('1.234.567,89 €');
    expect(formatMoney(usd(123450), 'en', { thousandSeparator: '' })).toBe('$1234.50');
  });

  it('shows the given number of decimals, rounding half away from zero', () => {
    expect(formatMoney(usd(1250), 'en', { decimals: 0 })).toBe('$13');
    expect(formatMoney(usd(1249), 'en', { decimals: 0 })).toBe('$12');
    expect(formatMoney(usd(3451), 'en', { decimals: 3 })).toBe('$34.510');
    expect(formatMoney({ amount: 1200, currency: 'JPY' }, 'en', { decimals: 2 })).toBe('¥1,200.00');
    expect(formatMoney({ amount: 1200, currency: 'JPY' }, 'en', {})).toBe('¥1,200');
    const de = { position: 'right_space', thousandSeparator: '.', decimalSeparator: ',', decimals: 0 } as const;
    expect(formatMoney(eur(123450), 'de-DE', de)).toBe('1.235 €');
  });

  it('leads a negative amount with a minus, before the symbol', () => {
    expect(formatMoney(usd(-123450), 'en', { position: 'left' })).toBe('-$1,234.50');
    const de = { position: 'right_space', thousandSeparator: '.', decimalSeparator: ',' } as const;
    expect(formatMoney(eur(-123450), 'de-DE', de)).toBe('-1.234,50 €');
    expect(formatMoney(usd(-1250), 'en', { decimals: 0 })).toBe('-$13');
    expect(formatMoney(usd(-4), 'en', { decimals: 0 })).toBe('$0');
  });

  it("keeps Intl's side and gap when no position is given", () => {
    expect(formatMoney(eur(123450), 'de-DE', { decimals: 0 })).toBe('1.235 €');
  });

  it('returns undefined for XXX', () => {
    expect(formatMoney({ amount: 3451, currency: 'XXX' }, 'en', { position: 'left' })).toBeUndefined();
  });

  it.each([
    ['USD', usd(123450), 'en', undefined, new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(1234.5)],
    ['EUR', eur(123450), 'de-DE', undefined, new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(1234.5)],
    ['JPY', { amount: 1200, currency: 'JPY' }, 'en', undefined, new Intl.NumberFormat('en', { style: 'currency', currency: 'JPY' }).format(1200)],
    ['negative USD', usd(-123450), 'en', undefined, new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(-1234.5)],
  ] as const)('without a format reads exactly as Intl: %s', (_label, money, locale, _format, expected) => {
    expect(formatMoney(money, locale)).toBe(expected);
  });

  it.each([
    ['left positive', usd(123450), 'en', { position: 'left' }, '$1,234.50'],
    ['left negative', usd(-123450), 'en', { position: 'left' }, '-$1,234.50'],
    ['left_space positive', usd(123450), 'en', { position: 'left_space' }, '$ 1,234.50'],
    ['left_space negative', usd(-123450), 'en', { position: 'left_space' }, '-$ 1,234.50'],
    ['right positive', usd(123450), 'en', { position: 'right' }, '1,234.50$'],
    ['right negative', usd(-123450), 'en', { position: 'right' }, '-1,234.50$'],
    ['right_space positive', usd(123450), 'en', { position: 'right_space' }, '1,234.50 $'],
    ['right_space negative', usd(-123450), 'en', { position: 'right_space' }, '-1,234.50 $'],
  ] as const)('uses the Woo position: %s', (_label, money, locale, format, expected) => {
    expect(formatMoney(money, locale, format)).toBe(expected);
  });

  it.each([
    ['EUR separators', eur(-123450), 'de-DE', { position: 'right_space', thousandSeparator: '.', decimalSeparator: ',' }, '-1.234,50 €'],
    ['rounds half away from zero', usd(-1250), 'en', { decimals: 0 }, '-$13'],
    ['no minus on zero', usd(-4), 'en', { decimals: 0 }, '$0'],
    ['one cent', usd(-1), 'en', { position: 'left' }, '-$0.01'],
  ] as const)('formats negatives: %s', (_label, money, locale, format, expected) => {
    expect(formatMoney(money, locale, format)).toBe(expected);
  });

  it.each([
    ['zero USD', usd(0), 'en', { position: 'left' }, '$0.00'],
    ['JPY', { amount: 123456, currency: 'JPY' }, 'en', { position: 'left' }, '¥123,456'],
    ['negative JPY', { amount: -123456, currency: 'JPY' }, 'en', { position: 'right_space' }, '-123,456 ¥'],
    ['JPY separators', { amount: 123456, currency: 'JPY' }, 'en', { position: 'left', decimals: 0, thousandSeparator: '.', decimalSeparator: ',' }, '¥123.456'],
    ['KRW', { amount: 1000, currency: 'KRW' }, 'en', { position: 'left' }, '₩1,000'],
  ] as const)('formats zero and zero-decimal currencies: %s', (_label, money, locale, format, expected) => {
    expect(formatMoney(money, locale, format)).toBe(expected);
  });

  it.each([
    ['French', eur(123456789), 'fr-FR', { position: 'right_space', thousandSeparator: '\u00a0', decimalSeparator: ',' }, '1\u00a0234\u00a0567,89 €'],
    ['English', eur(123456789), 'en', { position: 'right_space', thousandSeparator: '\u00a0', decimalSeparator: ',' }, '1\u00a0234\u00a0567,89 €'],
  ] as const)('uses non-breaking-space thousands in %s', (_label, money, locale, format, expected) => {
    const result = formatMoney(money, locale, format);
    expect(result).toBe(expected);
    expect(result).not.toContain('\u202f');
  });

  it.each([
    ['XXX', { amount: 3451, currency: 'XXX' }, 'en', { position: 'left' }, undefined],
    ['ZZZZ', { amount: 3451, currency: 'ZZZZ' }, 'en', { position: 'left' }, undefined],
  ] as const)('returns undefined for unknown code %s', (_label, money, locale, format, expected) => {
    expect(formatMoney(money, locale, format)).toBe(expected);
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

  it('keeps each price\'s own taxInclusive on current and was', () => {
    const flagged: ProductPrice[] = [
      { amount: 1200, currency: 'EUR', kind: 'base', taxInclusive: false },
      { amount: 1000, currency: 'EUR', kind: 'sale', taxInclusive: true },
    ];
    expect(resolvePrice(flagged)).toEqual({
      current: { amount: 1000, currency: 'EUR', taxInclusive: true },
      was: { amount: 1200, currency: 'EUR', taxInclusive: false },
    });
    expect(resolvePrice([flagged[0]])).toEqual({ current: { amount: 1200, currency: 'EUR', taxInclusive: false } });
  });

  it('omits taxInclusive when the source price has none', () => {
    const resolved = resolvePrice(prices, 'EUR')!;
    expect('taxInclusive' in resolved.current).toBe(false);
    expect('taxInclusive' in resolved.was!).toBe(false);
  });
});

describe('resolvePriceRange', () => {
  it('gives the min and max current price across variants', () => {
    const variants = [
      { prices: [{ amount: 1000, currency: 'EUR', kind: 'base' as const }] },
      { prices: [{ amount: 1100, currency: 'EUR', kind: 'base' as const }] },
      { prices: [{ amount: 1000, currency: 'EUR', kind: 'base' as const }] },
    ];
    expect(resolvePriceRange(variants)).toEqual({
      min: { amount: 1000, currency: 'EUR' },
      max: { amount: 1100, currency: 'EUR' },
    });
  });

  it('counts a sale price as that variant\'s current price', () => {
    const variants = [
      { prices: [{ amount: 2000, currency: 'EUR', kind: 'base' as const }] },
      {
        prices: [
          { amount: 2000, currency: 'EUR', kind: 'base' as const },
          { amount: 1500, currency: 'EUR', kind: 'sale' as const },
        ],
      },
    ];
    expect(resolvePriceRange(variants)).toEqual({
      min: { amount: 1500, currency: 'EUR' },
      max: { amount: 2000, currency: 'EUR' },
    });
  });

  it('skips a variant priced only in another currency', () => {
    const variants = [
      { prices: [{ amount: 1000, currency: 'EUR', kind: 'base' as const }] },
      { prices: [{ amount: 2000, currency: 'USD', kind: 'base' as const }] },
      { prices: [{ amount: 1100, currency: 'EUR', kind: 'base' as const }] },
    ];
    expect(resolvePriceRange(variants)).toEqual({
      min: { amount: 1000, currency: 'EUR' },
      max: { amount: 1100, currency: 'EUR' },
    });
  });

  it('returns undefined when no variant resolves', () => {
    expect(resolvePriceRange([{ prices: [] }, { prices: [] }])).toBeUndefined();
  });
});

describe('normalizeMoneyText (#672)', () => {
  const DOT = { decimalSeparator: '.', thousandSeparator: ',' };
  const COMMA = { decimalSeparator: ',', thousandSeparator: '.' };
  const SPACE = { decimalSeparator: ',', thousandSeparator: ' ' };

  it.each([
    ['1,234.50', DOT, '1234.50'],
    ['1.234,50', COMMA, '1234.50'],
    ['1,5', COMMA, '1.5'],
    ['9.99', COMMA, '9.99'],
    ['1,5', DOT, '1.5'],
    ['1,234,567', DOT, '1234567'],
    ['1 234,50', SPACE, '1234.50'],
    ['-12.5', DOT, '-12.5'],
    [' 12,75 ', COMMA, '12.75'],
  ])('NM1: reads v2 case %j', (text, format, expected) => {
    expect(normalizeMoneyText(text, format)).toBe(expected);
  });

  it.each(['1.2.3,4', '12abc', '1,2,3.4.5', '$12', '', '-'])('NM2: returns unreadable %j unchanged', (text) => {
    expect(normalizeMoneyText(text, DOT)).toBe(text);
  });

  it('NM3: gives a leading separator a 0 and drops a trailing one', () => {
    expect(normalizeMoneyText('.5', DOT)).toBe('0.5');
    expect(normalizeMoneyText('-.5', DOT)).toBe('-0.5');
    expect(normalizeMoneyText('1.', DOT)).toBe('1');
    expect(normalizeMoneyText('1,', COMMA)).toBe('1');
  });

  it('NM4: never rounds; a lone separator before exactly 3 digits is grouping (#1073)', () => {
    expect(normalizeMoneyText('1,000', DOT)).toBe('1000');
    expect(normalizeMoneyText('12.345', DOT)).toBe('12.345');
  });

  it.each([[undefined], [{}], [{ symbol: '€' }]])('NM5: returns the same string with format %j', (format) => {
    expect(normalizeMoneyText(' 1,234.50 ', format)).toBe(' 1,234.50 ');
    expect(normalizeMoneyText('1.234,50', format)).toBe('1.234,50');
  });

  it('NM6: returns a long digit run with a trailing letter unchanged', () => {
    const text = '1'.repeat(50_000) + 'x';
    expect(normalizeMoneyText(text, COMMA)).toBe(text);
  });
});

describe('normalizeMoneyText refuses an ambiguous amount, never guesses it up (#1073)', () => {
  const DOT = { decimalSeparator: '.', thousandSeparator: ',' };
  const COMMA = { decimalSeparator: ',', thousandSeparator: '.' };
  const APOS = { decimalSeparator: '.', thousandSeparator: "'" };
  const SPACE = { decimalSeparator: ',', thousandSeparator: ' ' };

  // The desk's table: a refused row comes back unchanged, for the caller to refuse.
  it.each([
    ['1..50', DOT, '1..50'],
    ['9.99.', DOT, '9.99.'],
    ['12..5', DOT, '12..5'],
    ['0.5.0', DOT, '0.5.0'],
    ['1,234,56', DOT, '1,234,56'],
    ['1.234.56', DOT, '1.234.56'],
    ['1.234.56', COMMA, '1.234.56'],
    ['1,23.45', DOT, '1,23.45'],
    ['1,234', DOT, '1234'],
    ['1,000', DOT, '1000'],
    ['1,5', DOT, '1.5'],
    ["1'234", APOS, '1234'],
    ['1 234', SPACE, '1234'],
  ])('N1: reads %j in %j as %j', (text, format, expected) => {
    expect(normalizeMoneyText(text, format)).toBe(expected);
  });

  it('N2: strips a thousand separator that is neither . nor , with no decimal part', () => {
    expect(normalizeMoneyText("1'234", APOS)).toBe('1234');
    expect(normalizeMoneyText('1 234', SPACE)).toBe('1234');
  });

  it('N3: a DOT store reads 1,234 in KWD as 1234.000, grouping and not a decimal point', () => {
    expect(moneyFromDecimalString(normalizeMoneyText('1,234', DOT), 'KWD')).toEqual({ amount: 1_234_000, currency: 'KWD' });
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatWcposMoney } from './money';

const spaces = (text: string) => text.replace(/\s/g, ' ');

describe('formatWcposMoney', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('§3.5 fixes the fraction digits when decimals is given, else uses the currency default', () => {
    expect(formatWcposMoney(25, 'USD')).toBe('$25.00');
    expect(formatWcposMoney(25, 'USD', { decimals: 0 })).toBe('$25');
    expect(formatWcposMoney(25, 'USD', { decimals: 3 })).toBe('$25.000');
    expect(formatWcposMoney(25, 'JPY')).toBe('¥25');
  });

  it('§3.5 keeps the narrow symbol: GBP in es-ES shows £, INR keeps ₹', () => {
    expect(formatWcposMoney(25, 'GBP', { locale: 'es_ES' })).toContain('£');
    expect(formatWcposMoney(25, 'GBP', { locale: 'es_ES' })).not.toContain('GBP');
    expect(formatWcposMoney(25, 'INR')).toBe('₹25.00');
  });

  it('§3.5 falls back to "<CURRENCY> <value>" for an unknown currency', () => {
    expect(formatWcposMoney(25, 'INVALID')).toBe('INVALID 25.00');
    expect(formatWcposMoney(25, '')).toBe('25.00');
  });

  it('§3.5 uses the locale decimal comma: de-DE', () => {
    expect(spaces(formatWcposMoney(25, 'EUR', { locale: 'de_DE' }))).toBe('25,00 €');
  });

  it('§3.5 prints the ISO code when the symbol is not encodable', () => {
    const isSymbolEncodable = (symbol: string) => symbol !== '£';
    expect(spaces(formatWcposMoney(25, 'GBP', { isSymbolEncodable }))).toBe('GBP 25.00');
    expect(formatWcposMoney(25, 'USD', { isSymbolEncodable })).toBe('$25.00');
  });

  it('§3.5 retries without narrowSymbol when Intl rejects it', () => {
    const Original = Intl.NumberFormat;
    vi.spyOn(Intl, 'NumberFormat').mockImplementation(function (
      locales?: string | string[], options?: Intl.NumberFormatOptions,
    ) {
      if (options?.currencyDisplay === 'narrowSymbol') throw new RangeError('narrowSymbol unsupported');
      return new Original(locales, options);
    } as typeof Intl.NumberFormat);
    expect(formatWcposMoney(25, 'USD')).toBe('$25.00');
  });
});

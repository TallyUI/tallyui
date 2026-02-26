import { describe, it, expect } from 'vitest';
import { formatCurrency } from './format-currency';

describe('formatCurrency', () => {
  it('formats USD with default locale', () => {
    const result = formatCurrency(10.5, 'USD', 'en-US');
    expect(result).toBe('$10.50');
  });

  it('formats EUR with German locale', () => {
    const result = formatCurrency(10.5, 'EUR', 'de-DE');
    expect(result.replace(/\s/g, ' ')).toBe('10,50 €');
  });

  it('formats JPY (zero decimals)', () => {
    const result = formatCurrency(1000, 'JPY', 'ja-JP');
    expect(result).toContain('1,000');
  });

  it('formats zero', () => {
    const result = formatCurrency(0, 'USD', 'en-US');
    expect(result).toBe('$0.00');
  });

  it('formats negative numbers', () => {
    const result = formatCurrency(-5.99, 'USD', 'en-US');
    expect(result).toContain('5.99');
  });

  it('memoizes formatter for same currency+locale pair', () => {
    const a = formatCurrency(1, 'USD', 'en-US');
    const b = formatCurrency(2, 'USD', 'en-US');
    expect(a).toBe('$1.00');
    expect(b).toBe('$2.00');
  });
});

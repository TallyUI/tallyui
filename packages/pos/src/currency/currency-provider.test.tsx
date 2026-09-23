import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CurrencyProvider, useCurrencyFormatter, useCurrencyCode } from './currency-provider';

function wrapper(currency: string, locale?: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <CurrencyProvider currencyCode={currency} locale={locale}>
        {children}
      </CurrencyProvider>
    );
  };
}

describe('CurrencyProvider + useCurrencyFormatter', () => {
  it('formats Money using its currency and the provided locale', () => {
    const { result } = renderHook(() => useCurrencyFormatter(), {
      wrapper: wrapper('USD', 'en'),
    });
    expect(result.current({ amount: 3451, currency: 'EUR' })).toBe('€34.51');
    expect(result.current({ amount: 1200, currency: 'JPY' })).toBe('¥1,200');
    expect(result.current({ amount: 1050, currency: 'USD' })).toBe('$10.50');
  });

  it('formats EUR with German locale', () => {
    const { result } = renderHook(() => useCurrencyFormatter(), {
      wrapper: wrapper('EUR', 'de-DE'),
    });
    expect(result.current({ amount: 1050, currency: 'EUR' }).replace(/\s/g, ' ')).toBe('10,50 €');
  });

  it('falls back to the minor-unit amount and code for XXX', () => {
    const { result } = renderHook(() => useCurrencyFormatter(), { wrapper: wrapper('EUR', 'en') });
    expect(result.current({ amount: 3451, currency: 'XXX' })).toBe('3451 XXX');
  });

  it('provides the default currency code', () => {
    const { result } = renderHook(() => useCurrencyCode(), { wrapper: wrapper('EUR') });
    expect(result.current).toBe('EUR');
  });

  it('throws when used outside provider', () => {
    expect(() => {
      renderHook(() => useCurrencyFormatter());
    }).toThrow('useCurrencyFormatter() must be used within a <CurrencyProvider>');
  });
});

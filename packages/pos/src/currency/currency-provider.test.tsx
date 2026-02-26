import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CurrencyProvider, useCurrencyFormatter } from './currency-provider';

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
  it('formats using provided currency and locale', () => {
    const { result } = renderHook(() => useCurrencyFormatter(), {
      wrapper: wrapper('USD', 'en-US'),
    });
    expect(result.current(10.5)).toBe('$10.50');
  });

  it('formats EUR with German locale', () => {
    const { result } = renderHook(() => useCurrencyFormatter(), {
      wrapper: wrapper('EUR', 'de-DE'),
    });
    expect(result.current(10.5).replace(/\s/g, ' ')).toBe('10,50 €');
  });

  it('throws when used outside provider', () => {
    expect(() => {
      renderHook(() => useCurrencyFormatter());
    }).toThrow('useCurrencyFormatter() must be used within a <CurrencyProvider>');
  });
});

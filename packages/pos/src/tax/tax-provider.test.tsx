import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { TaxProvider, useTax } from './tax-provider';

function wrapper(rates: Record<string, number>, pricesIncludeTax = false) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <TaxProvider rates={rates} pricesIncludeTax={pricesIncludeTax}>
        {children}
      </TaxProvider>
    );
  };
}

describe('TaxProvider + useTax', () => {
  it('provides default tax rate', () => {
    const { result } = renderHook(() => useTax(), {
      wrapper: wrapper({ default: 0.1 }),
    });
    expect(result.current.getTaxRate()).toBe(0.1);
  });

  it('provides tax rate by class', () => {
    const { result } = renderHook(() => useTax(), {
      wrapper: wrapper({ default: 0.2, reduced: 0.05, zero: 0 }),
    });
    expect(result.current.getTaxRate('reduced')).toBe(0.05);
    expect(result.current.getTaxRate('zero')).toBe(0);
  });

  it('falls back to default for unknown tax class', () => {
    const { result } = renderHook(() => useTax(), {
      wrapper: wrapper({ default: 0.1 }),
    });
    expect(result.current.getTaxRate('nonexistent')).toBe(0.1);
  });

  it('provides pricesIncludeTax flag', () => {
    const { result } = renderHook(() => useTax(), {
      wrapper: wrapper({ default: 0.1 }, true),
    });
    expect(result.current.pricesIncludeTax).toBe(true);
  });

  it('throws when used outside provider', () => {
    expect(() => {
      renderHook(() => useTax());
    }).toThrow('useTax() must be used within a <TaxProvider>');
  });
});

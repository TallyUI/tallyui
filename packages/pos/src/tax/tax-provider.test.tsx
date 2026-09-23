import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { TaxProvider, useTax } from './tax-provider';

function wrapper(ratesPpm: Record<string, number>, pricesIncludeTax = false) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <TaxProvider ratesPpm={ratesPpm} pricesIncludeTax={pricesIncludeTax}>
        {children}
      </TaxProvider>
    );
  };
}

describe('TaxProvider + useTax', () => {
  it('provides default tax rate', () => {
    const { result } = renderHook(() => useTax(), {
      wrapper: wrapper({ default: 100000 }),
    });
    expect(result.current.getTaxRatePpm()).toBe(100000);
  });

  it('provides tax rate by class', () => {
    const { result } = renderHook(() => useTax(), {
      wrapper: wrapper({ default: 200000, reduced: 50000, zero: 0 }),
    });
    expect(result.current.getTaxRatePpm('reduced')).toBe(50000);
    expect(result.current.getTaxRatePpm('zero')).toBe(0);
  });

  it('falls back to default for unknown tax class', () => {
    const { result } = renderHook(() => useTax(), {
      wrapper: wrapper({ default: 100000 }),
    });
    expect(result.current.getTaxRatePpm('nonexistent')).toBe(100000);
  });

  it('provides pricesIncludeTax flag', () => {
    const { result } = renderHook(() => useTax(), {
      wrapper: wrapper({ default: 100000 }, true),
    });
    expect(result.current.pricesIncludeTax).toBe(true);
  });

  it('falls back to zero without a default rate', () => {
    const { result } = renderHook(() => useTax(), { wrapper: wrapper({}) });
    expect(result.current.getTaxRatePpm()).toBe(0);
    expect(result.current.getTaxRatePpm('nonexistent')).toBe(0);
  });

  it.each([0.19, -1, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity])('rejects invalid ppm rate %s', (rate) => {
    expect(() => renderHook(() => useTax(), {
      wrapper: wrapper({ default: 190000, invalid: rate }),
    })).toThrow(new RangeError('TaxProvider: rates must be integer ppm'));
  });

  it('throws when used outside provider', () => {
    expect(() => {
      renderHook(() => useTax());
    }).toThrow('useTax() must be used within a <TaxProvider>');
  });
});

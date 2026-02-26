import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { TaxContext } from './types';

const TaxCtx = createContext<TaxContext | null>(null);

export interface TaxProviderProps {
  rates: Record<string, number>;
  pricesIncludeTax: boolean;
  children: ReactNode;
}

export function TaxProvider({ rates, pricesIncludeTax, children }: TaxProviderProps) {
  const value = useMemo<TaxContext>(
    () => ({
      getTaxRate(taxClass?: string) {
        if (taxClass && taxClass in rates) {
          return rates[taxClass];
        }
        return rates.default ?? 0;
      },
      pricesIncludeTax,
    }),
    [rates, pricesIncludeTax],
  );

  return <TaxCtx.Provider value={value}>{children}</TaxCtx.Provider>;
}

export function useTax(): TaxContext {
  const ctx = useContext(TaxCtx);
  if (!ctx) {
    throw new Error('useTax() must be used within a <TaxProvider>');
  }
  return ctx;
}

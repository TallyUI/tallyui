import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { TaxContext } from './types';

const TaxCtx = createContext<TaxContext | null>(null);

export interface TaxProviderProps {
  ratesPpm: Record<string, number>;
  pricesIncludeTax: boolean;
  children: ReactNode;
}

export function TaxProvider({ ratesPpm, pricesIncludeTax, children }: TaxProviderProps) {
  const value = useMemo<TaxContext>(
    () => {
      if (Object.values(ratesPpm).some((rate) => !Number.isSafeInteger(rate) || rate < 0)) {
        throw new RangeError('TaxProvider: rates must be integer ppm');
      }
      return {
        getTaxRatePpm: (taxClass) =>
          (taxClass === undefined ? undefined : ratesPpm[taxClass]) ?? ratesPpm.default ?? 0,
        pricesIncludeTax,
      };
    },
    [ratesPpm, pricesIncludeTax],
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

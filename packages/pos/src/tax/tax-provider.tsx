import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { TaxContext } from './types';
import { createLogger } from '../logging';

export const taxLogger = createLogger('tax');

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
      const unknown = new Set<string>();
      return {
        getTaxRatePpm: (taxClass) => {
          if (taxClass !== undefined && Object.hasOwn(ratesPpm, taxClass)) return ratesPpm[taxClass];
          // A class the store's rates don't key is taxed at the default rate; warn once per class and rate map.
          if (taxClass !== undefined && !unknown.has(taxClass)) {
            unknown.add(taxClass);
            taxLogger.warn('No tax rate for this tax class; using the default rate', { taxClass });
          }
          return ratesPpm.default ?? 0;
        },
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

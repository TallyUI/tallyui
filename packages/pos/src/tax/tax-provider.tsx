import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { StoreSettings, TaxRounding } from '@tallyui/core';
import type { TaxContext } from './types';
import { createTaxContext } from './tax-context';

export { taxLogger } from './tax-context';

const TaxCtx = createContext<TaxContext | null>(null);

export interface TaxProviderProps extends Pick<StoreSettings, 'taxRoundAtSubtotal' | 'shippingTaxClass' | 'taxClassSlugs'> {
  taxRates?: StoreSettings['taxRates'];
  ratesPpm: Record<string, number>;
  pricesIncludeTax: boolean;
  /** `ServerCapabilities.taxRounding` (#287); a change restarts an idle sale under it. */
  rounding?: TaxRounding;
  /** Tax class → the backend's rate name, for `per_rate_group_items`'s grouping (#287). */
  rateCodes?: Record<string, string>;
  children: ReactNode;
}

export function TaxProvider({ ratesPpm, pricesIncludeTax, rounding, rateCodes, taxRates, shippingTaxClass, taxClassSlugs, children }: TaxProviderProps) {
  const value = useMemo<TaxContext>(
    () => createTaxContext({ ratesPpm, pricesIncludeTax, rounding, rateCodes, taxRates, shippingTaxClass, taxClassSlugs }),
    [ratesPpm, pricesIncludeTax, rounding, rateCodes, taxRates, shippingTaxClass, taxClassSlugs],
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

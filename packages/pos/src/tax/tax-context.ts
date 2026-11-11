import { woocommerceTax } from '@tallyui/core';
import type { TaxContext } from './types';
import type { TaxProviderProps } from './tax-provider';
import { createLogger } from '../logging';

export const taxLogger = createLogger('tax');

/** `TaxProvider`'s context, built outside React (#722): a sale taxing by the customer's address builds one per matched rates. */
export function createTaxContext(props: Omit<TaxProviderProps, 'children'>): TaxContext {
  const { ratesPpm, pricesIncludeTax, rounding, rateCodes, taxRates, shippingTaxClass, taxClassSlugs } = props;
  if (Object.values(ratesPpm).some((rate) => !Number.isSafeInteger(rate) || rate < 0)) {
    throw new RangeError('TaxProvider: rates must be integer ppm');
  }
  const unknown = new Set<string>();
  return {
    ...(taxRates ? { getTaxRates: (taxClass?: string, options?: { shipping?: boolean }) =>
      (taxRates[woocommerceTax.normalizeTaxClass(taxClass)] ?? []).filter((rate) => !options?.shipping || rate.shipping) } : {}),
    getTaxRatePpm: (taxClass) => {
      if (taxClass !== undefined && Object.hasOwn(ratesPpm, taxClass)) return ratesPpm[taxClass];
      // A class the store's rates don't key is taxed at the default rate; warn once per class and rate map.
      if (taxClass !== undefined && !unknown.has(taxClass)) {
        unknown.add(taxClass);
        taxLogger.warn('No tax rate for this tax class; using the default rate', { taxClass });
      }
      return ratesPpm.default ?? 0;
    },
    // The name of the rate getTaxRatePpm picks: the class's own, else the default's.
    getTaxRateCode: (taxClass) => {
      const key = taxClass !== undefined && Object.hasOwn(ratesPpm, taxClass) ? taxClass : 'default';
      return rateCodes && Object.hasOwn(rateCodes, key) ? rateCodes[key] : undefined;
    },
    pricesIncludeTax,
    ...(rounding ? { rounding } : {}),
    ...(shippingTaxClass !== undefined ? { shippingTaxClass } : {}),
    ...(taxClassSlugs !== undefined ? { taxClassSlugs } : {}),
  };
}

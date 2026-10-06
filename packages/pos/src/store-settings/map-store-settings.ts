import type { StoreSettings, SyncContext } from '@tallyui/core';
import type { TaxProviderProps } from '../tax';

/** The replication's context with the settings' opaque pricing context; the key is left out when the settings have none. */
export function withPricingContext(context: SyncContext, settings: StoreSettings): SyncContext {
  const { pricingContext: _previous, ...rest } = context;
  return settings.pricingContext ? { ...rest, pricingContext: settings.pricingContext } : rest;
}

/**
 * `<TaxProvider>`'s props from the same settings, so its tax inclusivity, rounding and rate codes match the store's. `custom`
 * rounding passes none, the default (#287). An explicit `rounding` prop after the spread still wins, since JSX
 * applies props in order; so `<TaxProvider {...taxProviderProps(s)} rounding={undefined}>` wipes the store's rounding.
 */
export function taxProviderProps(settings: StoreSettings): Omit<TaxProviderProps, 'children'> {
  const rounding = settings.taxRounding?.granularity === 'custom' ? undefined : settings.taxRounding;
  return { ratesPpm: settings.taxRatesPpm, pricesIncludeTax: settings.pricesIncludeTax, ...(rounding && { rounding }), ...(settings.taxRateCodes && { rateCodes: settings.taxRateCodes }),
    ...(settings.taxRates && { taxRates: settings.taxRates }),
    ...(settings.taxRoundAtSubtotal !== undefined && { taxRoundAtSubtotal: settings.taxRoundAtSubtotal }),
    ...(settings.shippingTaxClass !== undefined && { shippingTaxClass: settings.shippingTaxClass }),
    ...(settings.taxClassSlugs && { taxClassSlugs: settings.taxClassSlugs }) };
}

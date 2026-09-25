import type { StoreSettings, SyncContext } from '@tallyui/core';
import type { TaxProviderProps } from '../tax';

/** The replication's context with the settings' opaque pricing context; the key is left out when the settings have none. */
export function withPricingContext(context: SyncContext, settings: StoreSettings): SyncContext {
  const { pricingContext: _previous, ...rest } = context;
  return settings.pricingContext ? { ...rest, pricingContext: settings.pricingContext } : rest;
}

/** `<TaxProvider>`'s props from the same settings, so its tax inclusivity matches the connector's. */
export function taxProviderProps(settings: StoreSettings): Omit<TaxProviderProps, 'children'> {
  return { ratesPpm: settings.taxRatesPpm, pricesIncludeTax: settings.pricesIncludeTax };
}

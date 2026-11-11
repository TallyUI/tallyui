import { woocommerceTax, type StoreSettings } from '@tallyui/core';
import type { CustomerSummary } from '../order/types';
import { taxProviderProps } from '../store-settings/map-store-settings';
import { taxSettingsForLocation } from './location-rates';
import { createTaxContext } from './tax-context';
import type { TaxContext } from './types';

/** A sale's tax context for one customer (#722), and the address WooCommerce matched its rates against. */
export interface SaleTaxContext { taxContext: TaxContext; location: woocommerceTax.ResolvedTaxLocation }

const NO_ADDRESS: woocommerceTax.TaxAddress = { country: '', state: '', city: '', postcode: '' };

/**
 * `useSale`'s `taxContextFor` (#722): the tax context for a customer's address, as WooCommerce's `tax_based_on` picks it.
 * Customers whose addresses match the same rates get the same `TaxContext` object, so a customer change that moves no
 * rate never re-taxes. Without `taxRateTable` and `baseTaxAddress` every customer gets the store's own context.
 * Build it once per settings (an app memoizes it): a new function restarts an idle sale, as new settings do.
 */
export function saleTaxContexts(settings: StoreSettings): (customer: CustomerSummary | null) => SaleTaxContext {
  const store = createTaxContext(taxProviderProps(settings));
  const base = settings.baseTaxAddress, table = settings.taxRateTable;
  if (!table || !base) {
    const location = woocommerceTax.orderTaxLocation(base ?? NO_ADDRESS, settings.taxBasedOn);
    return () => ({ taxContext: store, location });
  }
  const cache = new Map<string, TaxContext>();
  return (customer) => {
    const location = woocommerceTax.orderTaxLocation(base, settings.taxBasedOn,
      customer ? { billing: customer.billing, shipping: customer.shipping } : undefined);
    const local = taxSettingsForLocation(settings, location.location);
    const key = JSON.stringify([local.taxRates, local.taxRatesPpm]);
    let taxContext = cache.get(key);
    if (!taxContext) cache.set(key, taxContext = createTaxContext(taxProviderProps(local)));
    return { taxContext, location };
  };
}

import { woocommerceTax, type StoreSettings } from '@tallyui/core';

type TaxRates = NonNullable<StoreSettings['taxRates']>;

/** WooCommerce's order tax line `rate_code` (`WC_Tax::get_rate_code`), as the WooCommerce connector builds it. */
function rateCode(rate: woocommerceTax.WooTaxRate): string {
  return [rate.country, rate.state, rate.name || 'TAX', String(rate.priority)].filter(Boolean).join('-').toUpperCase();
}

/** A class's effective rate on 100 units taxed exclusive, compound rates included (v2's class ledger, tax-derivation.ts:49-74). */
function classRatePpm(rates: woocommerceTax.WooTaxRate[]): number {
  if (rates.length === 0) return 0;
  const percent = woocommerceTax.calculateTaxes({ amount: 100, rates, amountIncludesTax: false }).total;
  return Math.round(percent * 10000);
}

/**
 * `settings` with `taxRates` and `taxRatesPpm` re-derived for `location` from `settings.taxRateTable` (WooCommerce rules);
 * `settings` unchanged (the same object) when `taxRateTable` is absent. `taxRatesPpm` keys the standard class as `default`,
 * and every class in the table is present, at 0 when no rate matches, so it does not fall back to `default`.
 */
export function taxSettingsForLocation(settings: StoreSettings, location: woocommerceTax.TaxAddress): StoreSettings {
  const table = settings.taxRateTable;
  if (!table) return settings;
  const matched = woocommerceTax.filterTaxRates(table, location.country, location.state, location.postcode, location.city);
  const byClass = new Map<string, woocommerceTax.WooTaxRate[]>();
  for (const rate of table) {
    const slug = woocommerceTax.normalizeTaxClass(rate.class);
    if (!byClass.has(slug)) byClass.set(slug, []);
  }
  const taxRates: TaxRates = {};
  for (const rate of matched) {
    const slug = woocommerceTax.normalizeTaxClass(rate.class);
    byClass.get(slug)!.push(rate);
    (taxRates[slug] ??= []).push({ id: rate.id, code: rateCode(rate), label: rate.name, rate: rate.rate,
      priority: rate.priority, compound: rate.compound, shipping: rate.shipping });
  }
  const taxRatesPpm: StoreSettings['taxRatesPpm'] = { default: classRatePpm(byClass.get(woocommerceTax.STANDARD_TAX_CLASS) ?? []) };
  for (const [slug, rates] of byClass) {
    if (slug !== woocommerceTax.STANDARD_TAX_CLASS) taxRatesPpm[slug] = classRatePpm(rates);
  }
  return { ...settings, taxRates, taxRatesPpm };
}

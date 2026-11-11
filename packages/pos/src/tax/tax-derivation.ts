// The "Tax based on" panel's derivation (#722), after WCPOS v2 components/product/tax-based-on/tax-derivation.ts, MIT, WCPOS.
import { woocommerceTax, type StoreSettings } from '@tallyui/core';
import { classRatePercent } from './location-rates';

/** `useSale().taxLocation`: the address WooCommerce matched the sale's rates against, and whether the sale has a customer. */
export type SaleTaxLocation = woocommerceTax.ResolvedTaxLocation & { hasCustomer: boolean };

/** Why a rate matched, narrowest field first (v2's `rateWhy`). */
export type TaxRateWhy =
  | { field: 'postcode'; pattern: string } | { field: 'city' } | { field: 'state' }
  | { field: 'country'; country: string } | { field: 'anywhere' };

export interface TaxDerivationRate { id: number; name: string; percent: string; why: TaxRateWhy }
export interface TaxDerivationClass { slug: string; name: string; percent: string; rates: TaxDerivationRate[] }

export interface TaxDerivation {
  taxBasedOn: woocommerceTax.TaxBasedOn;
  addressUsed: woocommerceTax.TaxBasedOn;
  /** True when the address is the customer's (hasCustomer && addressUsed !== 'base'). */
  fromOrder: boolean;
  location: woocommerceTax.TaxAddress;
  fallback: 'shipping-to-billing' | 'shipping-to-shop' | 'billing-to-shop' | null;
  failure: 'address' | 'rates' | null;
  noRateCause: 'no-country' | 'not-covered' | 'no-rate-for-country' | null;
  /** Only the classes with at least one matched rate, in table order. Empty on failure. */
  classes: TaxDerivationClass[];
}

/** At most 4 decimals, trailing zeros and dot trimmed: "10.0000" → "10%", 8.875 → "8.875%". */
function formatTaxPercent(value: number | string): string {
  return `${Number(value).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}%`;
}

/** `standard` → "Standard", `reduced-rate` → "Reduced rate". TallyUI's own rule: StoreSettings has no class names. */
function taxClassName(slug: string): string {
  if (slug === woocommerceTax.STANDARD_TAX_CLASS) return 'Standard';
  const words = slug.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function rateWhy(rate: woocommerceTax.WooTaxRate): TaxRateWhy {
  if (rate.postcodes.length) return { field: 'postcode', pattern: rate.postcodes.join(', ') };
  if (rate.cities.length) return { field: 'city' };
  if (rate.state) return { field: 'state' };
  if (rate.country) return { field: 'country', country: rate.country };
  return { field: 'anywhere' };
}

type Matched = { slug: string; id: number; name: string; rate: string; why: TaxRateWhy;
  calc: woocommerceTax.CalculateTaxesInput['rates'][number] };

function matchedRates(settings: StoreSettings, location: woocommerceTax.TaxAddress): Matched[] {
  const table = settings.taxRateTable;
  if (!table) {
    return Object.entries(settings.taxRates ?? {}).flatMap(([slug, rates]) => rates.map((rate, index) => {
      const id = Number.isFinite(Number(rate.id)) ? Number(rate.id) : index;
      return { slug: woocommerceTax.normalizeTaxClass(slug), id, name: rate.label, rate: rate.rate, why: { field: 'anywhere' as const },
        calc: { id, rate: rate.rate, compound: rate.compound, priority: rate.priority, order: rate.priority } };
    }));
  }
  const order = new Map<string, number>();
  for (const rate of table) {
    const slug = woocommerceTax.normalizeTaxClass(rate.class);
    if (!order.has(slug)) order.set(slug, order.size);
  }
  const matched = woocommerceTax.filterTaxRates(table, location.country, location.state, location.postcode, location.city)
    .map((rate) => ({ slug: woocommerceTax.normalizeTaxClass(rate.class), id: rate.id, name: rate.name, rate: rate.rate,
      why: rateWhy(rate), calc: rate }));
  return matched.sort((a, b) => order.get(a.slug)! - order.get(b.slug)!);
}

function fallbackOf({ taxBasedOn, addressUsed, hasCustomer }: SaleTaxLocation): TaxDerivation['fallback'] {
  if (!hasCustomer || addressUsed === taxBasedOn) return null;
  if (taxBasedOn === 'shipping') return addressUsed === 'billing' ? 'shipping-to-billing' : 'shipping-to-shop';
  if (taxBasedOn === 'billing' && addressUsed === 'base') return 'billing-to-shop';
  return null;
}

/** Everything the "Tax based on" panel shows: the setting, the address used, and the rates that match it (#722). Pure. */
export function taxDerivation(settings: StoreSettings, taxLocation: SaleTaxLocation): TaxDerivation {
  const { taxBasedOn, addressUsed, location, hasCustomer } = taxLocation;
  const matched = matchedRates(settings, location);
  const empty = !location.country && !location.state && !location.city && !location.postcode;
  const failure = matched.length ? null : taxBasedOn !== 'base' && hasCustomer && empty ? 'address' : 'rates';
  let noRateCause: TaxDerivation['noRateCause'] = null;
  if (failure === 'rates') {
    const country = location.country.toUpperCase();
    noRateCause = !country ? 'no-country'
      : (settings.taxRateTable ?? []).some((rate) => rate.country.toUpperCase() === country) ? 'not-covered' : 'no-rate-for-country';
  }
  const groups = new Map<string, Matched[]>();
  for (const rate of matched) groups.set(rate.slug, [...(groups.get(rate.slug) ?? []), rate]);
  const classes = [...groups].map(([slug, rates]): TaxDerivationClass => ({
    slug, name: taxClassName(slug), percent: formatTaxPercent(classRatePercent(rates.map((rate) => rate.calc))),
    rates: rates.map(({ id, name, rate, why }) => ({ id, name, percent: formatTaxPercent(rate), why })),
  }));
  return { taxBasedOn, addressUsed, fromOrder: hasCustomer && addressUsed !== 'base', location,
    fallback: fallbackOf(taxLocation), failure, noRateCause, classes };
}

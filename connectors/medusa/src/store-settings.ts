import { StoreSettingsError } from '@tallyui/core';
import type { StoreSettings, StoreSettingsChoice, SyncContext } from '@tallyui/core';

type Store = { id: string; default_region_id: string | null };
type Country = { iso_2: string };
type Region = { id: string; name: string; currency_code: string; countries?: Country[] };
type PricePreference = { attribute: string; value: string; is_tax_inclusive: boolean };
type ApiKey = { id: string; title: string; token: string; revoked_at: string | null };
type TaxRate = { rate: number | null; is_default: boolean; rules?: unknown[] };
type TaxRegion = { country_code: string; province_code: string | null; tax_rates?: TaxRate[] };

/** A non-OK response becomes `StoreSettingsError('failed')`, carrying the HTTP status and Medusa's own `message`. */
async function get(context: SyncContext, path: string): Promise<any> {
  const response = await fetch(`${context.baseUrl}${path}`, {
    headers: { ...context.headers, 'Content-Type': 'application/json' },
    signal: context.signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new StoreSettingsError('failed', `Medusa store settings request failed (HTTP ${response.status})${body?.message ? `: ${body.message}` : ''}`);
  }
  return response.json();
}

function resolveRegion(regions: Region[], store: Store | undefined, choice?: StoreSettingsChoice): Region {
  const region =
    (choice?.region && regions.find((r) => r.id === choice.region)) ||
    (store?.default_region_id && regions.find((r) => r.id === store.default_region_id)) ||
    (regions.length === 1 ? regions[0] : undefined);
  // A chosen region that no longer resolves falls through the same ladder, and ends here too: choice_required, never failed.
  if (!region) throw new StoreSettingsError('choice_required', 'Medusa has more than one region; choose one', { regions: regions.map((r) => ({ id: r.id, name: r.name })) });
  return region;
}

/**
 * Reads the store's currency, tax inclusivity and location tax rate, and the
 * publishable-key channel, from Medusa's admin API only (TV4b). Read-only
 * (ADR-048). Region, then country, then channel: the first ambiguity that
 * needs a choice reports every choice known at that point, so the app asks
 * once.
 */
export const medusaStoreSettings = async (context: SyncContext, choice?: StoreSettingsChoice): Promise<StoreSettings> => {
  const [storeRes, regionsRes, pricePrefRes, apiKeysRes] = await Promise.all([
    get(context, '/admin/stores?fields=id,default_region_id'),
    get(context, '/admin/regions?limit=1000&fields=id,name,currency_code,*countries'),
    get(context, '/admin/price-preferences?limit=1000'),
    get(context, '/admin/api-keys?type=publishable&limit=1000&fields=id,title,token,revoked_at'),
  ]);

  const region = resolveRegion(regionsRes.regions ?? [], storeRes.stores?.[0], choice);

  const pricePreferences: PricePreference[] = pricePrefRes.price_preferences ?? [];
  const pref =
    pricePreferences.find((p) => p.attribute === 'region_id' && p.value === region.id) ??
    pricePreferences.find((p) => p.attribute === 'currency_code' && p.value === region.currency_code);
  const pricesIncludeTax = pref?.is_tax_inclusive ?? false;

  const countries = region.countries ?? [];
  const chosenCountry = choice?.country?.toLowerCase();
  const countryCode =
    (chosenCountry && countries.find((c) => c.iso_2.toLowerCase() === chosenCountry)?.iso_2) ||
    (countries.length === 1 ? countries[0]!.iso_2 : undefined);

  // Once the country is known, its tax region tells us the rate; ambiguity is reported below either way.
  let taxRegions: TaxRegion[] = [];
  if (countryCode !== undefined) {
    const taxRegionsRes = await get(context, `/admin/tax-regions?country_code=${encodeURIComponent(countryCode)}&limit=1000&fields=id,country_code,province_code,*tax_rates`);
    taxRegions = taxRegionsRes.tax_regions ?? [];
  }

  const apiKeys: ApiKey[] = apiKeysRes.api_keys ?? [];
  const availableKeys = apiKeys.filter((k) => !k.revoked_at);
  // No publishable key at all is a store misconfiguration, not a choice the app can offer.
  if (availableKeys.length === 0) throw new StoreSettingsError('failed', 'Medusa has no publishable API key; create one in the admin');
  const channelKey =
    (choice?.channel && availableKeys.find((k) => k.id === choice.channel)) ||
    (availableKeys.length === 1 ? availableKeys[0] : undefined);

  if (countryCode === undefined || !channelKey) {
    throw new StoreSettingsError('choice_required', 'Medusa needs a country and/or sales channel choice', {
      countries: countries.map((c) => c.iso_2.toLowerCase()),
      channels: availableKeys.map((k) => ({ id: k.id, name: k.title })),
    });
  }

  // The country's own tax region (province_code null); a province-level one is not the store's rate.
  const countryTaxRegion = taxRegions.find((tr) => tr.province_code === null);
  // A rate with rules is a product/customer-specific override, not a tax class, and is never the default.
  const eligibleRates = (countryTaxRegion?.tax_rates ?? []).filter((r) => !r.rules || r.rules.length === 0);
  const defaultRate = eligibleRates.find((r) => r.is_default);
  // No tax region, or no default rate: Medusa's system provider adds no tax line, so default is 0 — never a silent guess.
  const taxRatesPpm = { default: defaultRate?.rate != null ? Math.round(defaultRate.rate * 10_000) : 0 };

  return {
    currency: region.currency_code.toUpperCase(),
    pricesIncludeTax,
    taxRatesPpm,
    // The publishable key is a public credential, as storefronts embed it, so it may sit here.
    // It never appears in an error message, `choices`, or console output — only in this context.
    pricingContext: {
      region_id: region.id,
      currency_code: region.currency_code.toLowerCase(),
      publishable_key: channelKey.token,
    },
  };
};

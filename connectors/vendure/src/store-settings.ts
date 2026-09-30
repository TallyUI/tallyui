import { StoreSettingsError } from '@tallyui/core';
import type { StoreSettings, StoreSettingsChoice, SyncContext } from '@tallyui/core';

import { gql } from './replication/products';

const CHANNEL_AND_CATEGORIES_QUERY = `
  query StoreSettingsChannel {
    activeChannel { defaultCurrencyCode pricesIncludeTax defaultTaxZone { id } }
    taxCategories { items { id isDefault } }
  }
`;

const TAX_RATES_QUERY = `
  query StoreSettingsTaxRates($zoneId: String!) {
    taxRates(options: { take: 1000, filter: { zoneId: { eq: $zoneId } } }) {
      items { name enabled value category { id } customerGroup { id } }
    }
  }
`;

type ActiveChannel = { defaultCurrencyCode: string; pricesIncludeTax: boolean; defaultTaxZone: { id: string } | null };
type TaxCategory = { id: string; isDefault: boolean };
type TaxRateItem = { name?: string; enabled: boolean; value: number; category: { id: string } | null; customerGroup: { id: string } | null };

/** `gql` throws a plain `Error` for a non-OK response or a GraphQL `errors` body; both become `StoreSettingsError('failed')` here. */
async function query(context: SyncContext, source: string, variables?: Record<string, unknown>): Promise<any> {
  try {
    return await gql(context, source, variables);
  } catch (error) {
    throw new StoreSettingsError('failed', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Reads the active channel's currency and tax-inclusivity (ADR-049), and the
 * default tax zone's enabled, non-customer-group rates keyed by tax category
 * id, in integer ppm rounded once, with their rate names for grouping. Read-only (ADR-048). Ignores `choice`:
 * Vendure's channel is already chosen by the `vendure-token` header sent
 * with every request, so there is no `pricingContext` either.
 */
export const vendureStoreSettings = async (context: SyncContext, _choice?: StoreSettingsChoice): Promise<StoreSettings> => {
  const head = await query(context, CHANNEL_AND_CATEGORIES_QUERY);
  const channel = head.data?.activeChannel as ActiveChannel | undefined;
  if (!channel) throw new StoreSettingsError('failed', 'Vendure returned no active channel');
  const categories: TaxCategory[] = head.data?.taxCategories?.items ?? [];

  let rateItems: TaxRateItem[] = [];
  if (channel.defaultTaxZone) {
    const ratesBody = await query(context, TAX_RATES_QUERY, { zoneId: channel.defaultTaxZone.id });
    rateItems = ratesBody.data?.taxRates?.items ?? [];
  }

  const byCategory = new Map<string, number>();
  const namesByCategory = new Map<string, string>();
  for (const rate of rateItems) {
    if (!rate.enabled || rate.customerGroup || !rate.category) continue;
    // Rounded once, here, at the connector's edge (a backend decimal percentage -> integer ppm).
    byCategory.set(rate.category.id, Math.round(rate.value * 10_000));
    if (typeof rate.name === 'string' && rate.name) namesByCategory.set(rate.category.id, rate.name);
    else namesByCategory.delete(rate.category.id);
  }

  // Vendure's own fallback for a variant created without a category
  // (getTaxCategoryForNewVariant, @vendure/core 3.7.3,
  // dist/service/services/product-variant.service.js:875): the isDefault
  // category, or, when none is flagged, taxCategories.items[0]. When that
  // category has no enabled rate in the zone (or there are no categories
  // at all), `default` is 0 — that is what Vendure itself charges in that
  // case, never a silent guess.
  const defaultCategory = categories.find((c) => c.isDefault) ?? categories[0];
  const taxRateCodes: Record<string, string> = {};
  const defaultName = defaultCategory && namesByCategory.get(defaultCategory.id);
  if (defaultName) taxRateCodes.default = defaultName;
  for (const [categoryId, name] of namesByCategory) taxRateCodes[categoryId] = name;
  const taxRatesPpm: { default: number; [taxClass: string]: number } = {
    default: defaultCategory ? byCategory.get(defaultCategory.id) ?? 0 : 0,
  };
  for (const [categoryId, ppm] of byCategory) taxRatesPpm[categoryId] = ppm;
  // A category with no enabled rate in the zone is charged 0 by Vendure, as for `default` above: an explicit 0, so the
  // till never taxes it at the default rate (#288).
  for (const category of categories) taxRatesPpm[category.id] ??= 0;

  return {
    currency: channel.defaultCurrencyCode,
    pricesIncludeTax: channel.pricesIncludeTax,
    taxRatesPpm,
    ...(Object.keys(taxRateCodes).length > 0 && { taxRateCodes }),
  };
};

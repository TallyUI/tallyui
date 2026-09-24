import type { SyncContext } from '@tallyui/core';
import { STORE_PAGE_SIZE, STORE_PRICE_FIELDS, storeGet } from '../pricing/calculated';
import type { MedusaCalculatedPrice, MedusaProductDocument } from '../schemas/products';

/** The calculated-price check's interval: price-list edits and sale start/end bump no timestamp (ADR-060 amendment 8). */
export const MEDUSA_CALCULATED_PRICE_RECONCILE_INTERVAL_MS = 30 * 60 * 1000;

type Variant = { id: string; calculated_price?: MedusaCalculatedPrice | null };

/** Sorted and `|`-joined; a variant with no calculated price contributes `${variantId}:-`. */
function fingerprintOf(variants: Variant[]): string {
  return variants.map(({ id, calculated_price: c }) => (c
    ? `${id}:${c.currency_code}:${c.calculated_amount}:${c.original_amount}:${c.is_calculated_price_tax_inclusive}:${c.is_original_price_tax_inclusive}:${c.calculated_price?.price_list_type ?? ''}`
    : `${id}:-`)).sort().join('|');
}

/**
 * Every product the store API lists for the pricing context, with its
 * calculated-price fingerprint, one `/store/products` request per page of
 * 100 (ADR-060 amendment 8, D2b). Without `context.pricingContext` it yields
 * nothing, so the pass is empty and complete. Products the sales channel
 * does not list are not reported; the runner counts them as `unreported`.
 *
 * The app runs it as `reconcile.calculatedPrices` with
 * `startFingerprintReconcile({ …, intervalMs: MEDUSA_CALCULATED_PRICE_RECONCILE_INTERVAL_MS, maxPages: 1000 })`:
 * the runner's default of 100 pages of 100 products would truncate at 10,000 products.
 */
export async function* fetchPages(context: SyncContext): AsyncIterable<Map<string, string>> {
  const pricing = context.pricingContext;
  if (!pricing) return;
  for (let offset = 0, count = 1; offset < count; offset += STORE_PAGE_SIZE) {
    const params = new URLSearchParams({
      region_id: pricing.region_id ?? '', limit: String(STORE_PAGE_SIZE), offset: String(offset), order: 'id', fields: STORE_PRICE_FIELDS,
    });
    const data = await storeGet(`/store/products?${params}`, context);
    count = data.count;
    yield new Map((data.products ?? []).map((p) => [String(p.id), fingerprintOf(p.variants ?? [])]));
  }
}

/** The same fingerprint, from a local document's `variants[].calculated_price`. */
export function fingerprint(doc: MedusaProductDocument): string {
  return fingerprintOf(doc.variants ?? []);
}

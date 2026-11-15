import type { SyncContext } from '@tallyui/core';
import { adminGet } from '../admin-get';

/** Admin API list limit; also the price-listing page size (ADR-060). */
const PAGE_SIZE = 1000;

/** The nightly base-price backstop's interval (ADR-060 amendment 8). */
export const MEDUSA_PRICE_RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1000;

type Price = { amount: number; currency_code: string; price_list_id?: string | null };
type Variant = { id: string; product_id: string; prices?: Price[] };

/** Base prices only (a null `price_list_id`), as `${variantId}:${currencyCode}:${amount}`, sorted and joined. */
const fingerprintOf = (entries: string[]): string => [...entries].sort().join('|');

/** A variant's base-price entries (prices with no `price_list_id`), as `${variantId}:${currencyCode}:${amount}`. */
const baseEntries = (variant: { id: unknown; prices?: Price[] | null }): string[] =>
  (variant.prices ?? []).filter((price) => !price.price_list_id).map((price) => `${variant.id}:${price.currency_code}:${price.amount}`);

/**
 * Every product's base-price fingerprint, one `/admin/product-variants`
 * request per page (ADR-060 amendment 8's nightly backstop). The listing is
 * not grouped by product, so each product's variants may land on different
 * pages; a page's yielded entry is always recomputed from every base price
 * seen for that product so far, so the last page that touches a product
 * carries its complete, correct fingerprint. The reconcile runner keeps only
 * the latest entry per id, so earlier, partial entries are harmless.
 */
export async function* fetchPages(context: SyncContext): AsyncIterable<Map<string, string>> {
  const byProduct = new Map<string, string[]>();
  for (let offset = 0, count = 1; offset < count; offset += PAGE_SIZE) {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE), offset: String(offset), order: 'id',
      fields: 'id,product_id,prices.amount,prices.currency_code,prices.price_list_id',
    });
    const data = await adminGet(`/admin/product-variants?${params}`, context);
    const variants: Variant[] = data.variants ?? [];
    count = data.count;
    const touched = new Set<string>();
    for (const variant of variants) {
      const productId = String(variant.product_id);
      touched.add(productId);
      const entries = byProduct.get(productId) ?? [];
      byProduct.set(productId, entries);
      entries.push(...baseEntries(variant));
    }
    yield new Map([...touched].map((id) => [id, fingerprintOf(byProduct.get(id) ?? [])]));
  }
}

/** The same fingerprint, computed from a local product document's base prices. Replicated Medusa documents carry only base prices today (ADR-060 amendment 8); any `price_list_id` is still skipped, for consistency. */
export function fingerprint(doc: any): string {
  return fingerprintOf((doc.variants ?? []).flatMap(baseEntries));
}

import type { SyncContext } from '@tallyui/core';
import { gql } from '../replication/products';

/** Vendure Admin API maximum `take`; also the price-listing page size (ADR-060). */
const PAGE_SIZE = 1000;

/**
 * The nightly base-price backstop's interval: tax-rate changes move
 * `priceWithTax` without bumping `updatedAt` (ADR-060).
 */
export const VENDURE_PRICE_RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1000;

const PRICE_LIST_QUERY = `
  query GetVariantPrices($options: ProductVariantListOptions) {
    productVariants(options: $options) { items { id productId price priceWithTax currencyCode } totalItems }
  }
`;

/** `${variantId}:${currencyCode}:${price}:${priceWithTax}` entries, sorted and joined. */
const fingerprintOf = (entries: string[]): string => [...entries].sort().join('|');

/**
 * Every product's price fingerprint, one `productVariants` page at a time
 * (ADR-060's nightly backstop). The listing is not grouped by product, so a
 * product's variants may land on different pages; a page's yielded entry is
 * always recomputed from every variant seen for that product so far, so the
 * last page that touches a product carries its complete, correct
 * fingerprint. The reconcile runner keeps only the latest entry per id, so
 * earlier, partial entries are harmless.
 */
export async function* fetchPages(context: SyncContext): AsyncIterable<Map<string, string>> {
  const byProduct = new Map<string, string[]>();
  for (let skip = 0, total = 1; skip < total; skip += PAGE_SIZE) {
    const res = await gql(context, PRICE_LIST_QUERY, { options: { take: PAGE_SIZE, skip, sort: { id: 'ASC' } } });
    const { items, totalItems } = res.data.productVariants as {
      items: Array<{ id: string; productId: string; price: number; priceWithTax: number; currencyCode: string }>;
      totalItems: number;
    };
    total = totalItems;
    const touched = new Set<string>();
    for (const variant of items) {
      const productId = String(variant.productId);
      touched.add(productId);
      const entries = byProduct.get(productId) ?? [];
      byProduct.set(productId, entries);
      entries.push(`${variant.id}:${variant.currencyCode}:${variant.price}:${variant.priceWithTax}`);
    }
    yield new Map([...touched].map((id) => [id, fingerprintOf(byProduct.get(id) ?? [])]));
  }
}

/** The same fingerprint, computed from a local product document's variants. Replicated Vendure documents already carry `price`, `priceWithTax` and `currencyCode`. */
export function fingerprint(doc: any): string {
  const entries: string[] = (doc.variants ?? []).map(
    (v: any) => `${v.id}:${v.currencyCode}:${v.price}:${v.priceWithTax}`,
  );
  return fingerprintOf(entries);
}

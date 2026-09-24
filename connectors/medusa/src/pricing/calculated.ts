import type { SyncContext } from '@tallyui/core';
import type { MedusaCalculatedPrice, MedusaProductDocument } from '../schemas/products';

/** Store API list limit used here; also the most ids per enrichment request (as `fetchByIds`). */
export const STORE_PAGE_SIZE = 100;

/** Only what pricing needs: the product id and each variant's calculated price. */
export const STORE_PRICE_FIELDS = 'id,*variants.calculated_price';

export type StoreProduct = { id: string; variants?: Array<{ id: string; calculated_price?: MedusaCalculatedPrice | null }> };

/**
 * GET a store API path with the pricing context's publishable key. The admin
 * `context.headers` (its `Authorization`) are never sent to `/store/*`. A
 * non-OK response throws with the status and Medusa's message, with the key
 * scrubbed out of it.
 */
export async function storeGet(path: string, context: SyncContext): Promise<{ products?: StoreProduct[]; count: number }> {
  const key = context.pricingContext?.publishable_key ?? '';
  const response = await fetch(`${context.baseUrl}${path}`, {
    headers: { 'x-publishable-api-key': key, 'Content-Type': 'application/json' },
    signal: context.signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message = typeof error?.message === 'string' && key ? error.message.split(key).join('[key]') : error?.message;
    throw new Error(`Medusa store API error: ${response.status}${message ? `: ${message}` : ''}`);
  }
  return response.json();
}

/**
 * Fills each variant's `calculated_price` from the store API, priced with
 * `context.pricingContext` (`region_id`, `publishable_key`): what Medusa
 * charges at checkout, sale price lists and their dates included (ADR-060
 * amendment 8, D2b). A variant the store API does not list (a draft, or a
 * product outside the key's sales channel) gets `null`: priced mode, not
 * sellable here. Without a pricing context the documents come back
 * unchanged (base-only mode, no `calculated_price` key). A failed store
 * request throws, so the pull retries and never delivers a half-priced
 * document.
 */
export async function withCalculatedPrices<Doc extends MedusaProductDocument>(docs: Doc[], context: SyncContext): Promise<Doc[]> {
  const pricing = context.pricingContext;
  if (!pricing) return docs;
  const byVariant = new Map<string, MedusaCalculatedPrice | null>();
  for (let i = 0; i < docs.length; i += STORE_PAGE_SIZE) {
    const params = new URLSearchParams({ region_id: pricing.region_id ?? '', limit: String(STORE_PAGE_SIZE), fields: STORE_PRICE_FIELDS });
    for (const doc of docs.slice(i, i + STORE_PAGE_SIZE)) params.append('id[]', doc.id);
    const data = await storeGet(`/store/products?${params}`, context);
    for (const product of data.products ?? []) {
      for (const variant of product.variants ?? []) byVariant.set(variant.id, variant.calculated_price ?? null);
    }
  }
  return docs.map((doc) => (Array.isArray(doc.variants)
    ? { ...doc, variants: doc.variants.map((v) => ({ ...v, calculated_price: byVariant.get(v.id) ?? null })) }
    : doc));
}

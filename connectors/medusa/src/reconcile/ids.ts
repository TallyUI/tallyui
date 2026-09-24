import type { SyncContext } from '@tallyui/core';
import { MEDUSA_PRODUCT_FIELDS, toDocument } from '../replication/products';
import { withCalculatedPrices } from '../pricing/calculated';
import type { MedusaProductDocument } from '../schemas/products';

/** Admin API list limit; also the id-listing page size (ADR-060). */
const PAGE_SIZE = 1000;

/**
 * At most this many ids per `fetchByIds` request. Medusa ids are about 31
 * characters; 1,000 of them would pass Node's 16 KB header/URL limit.
 */
const MAX_IDS_PER_REQUEST = 100;

async function get(path: string, context: SyncContext) {
  const response = await fetch(`${context.baseUrl}${path}`, {
    headers: { ...context.headers, 'Content-Type': 'application/json' },
    signal: context.signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Medusa API error: ${response.status}${error?.message ? `: ${error.message}` : ''}`);
  }
  return response.json();
}

/** Every live product id with its live variant ids, one request per page (ADR-060). */
export async function* fetchPages(context: SyncContext): AsyncIterable<Array<{ id: string; variantIds: string[] }>> {
  for (let offset = 0, count = 1; offset < count; offset += PAGE_SIZE) {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset), order: 'id', fields: 'id,variants.id' });
    const data = await get(`/admin/products?${params}`, context);
    const products: Array<{ id: string; variants?: Array<{ id: string }> }> = data.products ?? [];
    count = data.count;
    yield products.map((p) => ({ id: String(p.id), variantIds: (p.variants ?? []).map((v) => String(v.id)) }));
  }
}

/** The variant ids a local product document lists. */
export function variantIds(doc: any): string[] {
  return (doc.variants ?? []).map((v: any) => String(v.id));
}

/** `fetchByIds` for `createReconcileFeed`, in the replication feed's document shape. */
export async function fetchByIds(ids: string[], context: SyncContext): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += MAX_IDS_PER_REQUEST) {
    const chunk = ids.slice(i, i + MAX_IDS_PER_REQUEST);
    const params = new URLSearchParams({ fields: MEDUSA_PRODUCT_FIELDS, limit: String(chunk.length) });
    for (const id of chunk) params.append('id[]', id);
    const data = await get(`/admin/products?${params}`, context);
    const products: Array<Record<string, unknown>> = data.products ?? [];
    results.push(...products.map(toDocument));
  }
  // Priced through the store API when the context carries a pricing context (D2b); the variant and reconcile feeds both build here.
  return withCalculatedPrices(results as MedusaProductDocument[], context);
}

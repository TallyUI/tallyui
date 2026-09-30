import type { CatalogueReconcileAdapter, CatalogueReconcileEntry, ReconcileFeed, SyncContext } from '@tallyui/core';
import { checkResponse, WooMissingUuidError } from '../replication/products';

/** The listing's page size, WordPress's per_page maximum. */
const PAGE_SIZE = 100;
/** Enough to compare: the key, the numeric id to refetch by, and the fingerprint's fields. */
const LISTING_FIELDS = 'id,uuid,date_modified_gmt,stock_quantity,stock_status';
/** The wcpos/v2/status capability that announces the bulk-id listing (wcpos/woocommerce-pos#2113). */
const ID_FAST_PATH = 'products_id_fast_path';

/**
 * What the catalogue reconcile compares: the modified time and the stock (#248 A1). WooCommerce's
 * `update_product_stock()` writes `_stock` by a direct query that leaves the modified time alone.
 */
export const wooReconcileFingerprint = (p: { date_modified_gmt?: string | null; stock_quantity?: number | null; stock_status?: string | null }) =>
  [p.date_modified_gmt ?? '', p.stock_quantity ?? '', p.stock_status ?? ''].join('|');

async function get(path: string, context: SyncContext): Promise<any> {
  const response = await fetch(`${context.baseUrl}${path}`, {
    headers: { ...context.headers, 'Content-Type': 'application/json' },
    signal: context.signal,
  });
  await checkResponse(response);
  return response.json();
}

/**
 * The switch for the bulk-id fast path: true only when wcpos/v2/status lists `products_id_fast_path` in
 * `capabilities` (a missing field is false). Never a version number, and never a failed attempt.
 */
export async function wooHasIdFastPath(context: SyncContext): Promise<boolean> {
  const status = await get('/status', context);
  return Array.isArray(status?.capabilities) && status.capabilities.includes(ID_FAST_PATH);
}

/**
 * The fast path's one request, pinned to the contract recorded for wcpos/woocommerce-pos#2113: WCPOS's own
 * `fields`, not WordPress's `_fields`, answered from SQL. The context headers carry `X-WCPOS`.
 */
export function wooBulkListingUrl(baseUrl: string): string {
  const params = new URLSearchParams({ per_page: '-1' });
  for (const field of ['id', 'date_modified_gmt', 'stock_quantity', 'stock_status']) params.append('fields[]', field);
  return `${baseUrl}/products?${params}`;
}

/**
 * The daily catalogue check for WooCommerce (#248): lists every published product with its fingerprint,
 * page by page with no date filter, and hands differences to `feed`, which reaches the collection only
 * through the pull. `confirmGone` is the deletion proof: a by-id re-read.
 */
export function wooCatalogueReconcile(feed: Pick<ReconcileFeed<any>, 'enqueue'>): CatalogueReconcileAdapter<any, number> {
  return {
    async *fetchPages(context, from = 1) {
      // One status read per pass, yielded as an empty page so that it takes its own budget slot.
      const fast = await wooHasIdFastPath(context);
      yield { entries: [], cursor: from };
      if (fast) {
        // TODO(#2113): list with one wooBulkListingUrl request. It returns `id` but no `uuid`, and entries are
        // keyed by uuid, so it needs an id-to-uuid mapping from the till's documents, which this adapter cannot
        // read. Until that is designed, a store with the capability is listed page by page like any other.
      }
      // status=publish: a product that is not published is absent, so it becomes a deletion candidate and
      // confirmGone decides; drafts cost no daily refetch.
      for (let page = from; ; page++) {
        const params = new URLSearchParams({
          per_page: String(PAGE_SIZE), page: String(page), orderby: 'id', order: 'asc', status: 'publish', _fields: LISTING_FIELDS,
        });
        const rows: any[] = await get(`/products?${params}`, context);
        const entries = rows.map((row): CatalogueReconcileEntry => {
          if (typeof row.uuid !== 'string' || row.uuid.length === 0) throw new WooMissingUuidError(row.id);
          return { key: row.uuid, fingerprint: wooReconcileFingerprint(row), remote: row.id };
        });
        yield { entries, cursor: page + 1 };
        if (rows.length < PAGE_SIZE) return;
      }
    },
    fingerprint: wooReconcileFingerprint,
    async confirmGone(locals, context) {
      const ids = locals.map((doc) => doc.id).filter((id) => Number.isInteger(id));
      // An empty include= would list the whole store; a local without a numeric id has no proof and is kept.
      if (!ids.length) return [];
      const params = new URLSearchParams({ include: ids.join(','), per_page: String(PAGE_SIZE), status: 'any', _fields: 'id,uuid,status' });
      const rows: Array<{ id: number; status: string }> = await get(`/products?${params}`, context);
      const live = new Set(rows.filter((row) => row.status === 'publish').map((row) => row.id));
      return locals.filter((doc) => Number.isInteger(doc.id) && !live.has(doc.id)).map((doc) => doc.uuid);
    },
    // An entry with no numeric id, locally or in the listing, is dropped: the store cannot be asked about it, so
    // the feed would find nothing and tombstone it without proof. (The schema requires only uuid.)
    enqueue: (entries) => feed.enqueue(entries.filter((e) => e.tombstone || Number.isInteger(e.local?.id) || Number.isInteger(e.remote))),
  };
}

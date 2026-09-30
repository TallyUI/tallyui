import { errorKind, type CatalogueReconcileAdapter, type CatalogueReconcileEntry, type ReconcileFeed, type SyncContext } from '@tallyui/core';
import { checkResponse } from '../replication/products';

/** The listing's page size, WordPress's per_page maximum. */
const PAGE_SIZE = 100;
/**
 * Both listings' fields, and exactly the fast path's: the numeric id (the key, and how a product is refetched) and
 * the fingerprint's. No uuid: the pull's `toProductDocument` still requires one on every product it delivers.
 */
const LISTING_FIELDS = 'id,date_modified_gmt,stock_quantity,stock_status';
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
 * A failed status read is "no capability known"; only a 401 or 403 would make the paged listing fail the same way.
 * Only a till-class error (401 `unauthorized`, 426 `till_update_required`) or an abort stops the pass.
 * A 403 `forbidden` is store-class: the whole pass is logged `skipped` and runs again at the next check (hourly by default).
 */
export async function wooHasIdFastPath(context: SyncContext): Promise<boolean> {
  let status: any;
  try {
    status = await get('/status', context);
  } catch (error) {
    if (errorKind(error) === 'till' || context.signal?.aborted) throw error;
    return false;
  }
  return Array.isArray(status?.capabilities) && status.capabilities.includes(ID_FAST_PATH);
}

/**
 * The fast path's one request (wcpos/woocommerce-pos #2116, #2119, #2121): WordPress's `_fields` with exactly these
 * four, answered from SQL, published POS-visible products only. The context headers carry `X-WCPOS`.
 */
export function wooBulkListingUrl(baseUrl: string): string {
  return `${baseUrl}/products?${new URLSearchParams({ per_page: '-1', _fields: LISTING_FIELDS })}`;
}

/** Listing rows as entries keyed by the numeric id (#313); a row without an integer id cannot be asked about, and is dropped. */
const toEntries = (rows: any[]) => rows.filter((row) => Number.isInteger(row?.id))
  .map((row): CatalogueReconcileEntry => ({ key: String(row.id), fingerprint: wooReconcileFingerprint(row), remote: row.id }));

/**
 * The daily catalogue check for WooCommerce (#248): lists every published product with its fingerprint, in one
 * fast-path request where the store offers it (#313), else page by page, with no date filter, and hands differences
 * to `feed`, which reaches the collection only through the pull. `confirmGone` is the deletion proof: a by-id re-read.
 */
export function wooCatalogueReconcile(feed: Pick<ReconcileFeed<any>, 'enqueue'>): CatalogueReconcileAdapter<any, number> {
  return {
    async *fetchPages(context, from = 1) {
      // One status read per pass, yielded as an empty page so that it takes its own budget slot.
      const fast = await wooHasIdFastPath(context);
      yield { entries: [], cursor: from };
      if (fast) {
        // The whole catalogue in one request, so `from` is moot. A store that refuses it (a store scope answers 400)
        // falls back to the paged listing, which fails the same way. A 403 `forbidden` is skipped until the next hourly
        // check; only a till-class error or an abort stops the pass.
        let rows: any;
        let failed = false;
        try {
          rows = await get(wooBulkListingUrl(''), context); // get() prefixes context.baseUrl
        } catch (error) {
          if (errorKind(error) === 'till' || context.signal?.aborted) throw error;
          failed = true;
          console.warn(`WooCommerce catalogue reconcile: the fast path failed (${(error as Error)?.message ?? error}); listing page by page.`);
        }
        if (Array.isArray(rows)) {
          yield { entries: toEntries(rows), cursor: from };
          return;
        }
        if (!failed) console.warn('WooCommerce catalogue reconcile: the fast path answered with something that is not a list; listing page by page.');
        // An empty page, so the fallback's first request takes its own budget slot, as the status read does.
        yield { entries: [], cursor: from };
      }
      // status=publish: a product that is not published is absent, so it becomes a deletion candidate and
      // confirmGone decides; drafts cost no daily refetch.
      for (let page = from; ; page++) {
        const params = new URLSearchParams({
          per_page: String(PAGE_SIZE), page: String(page), orderby: 'id', order: 'asc', status: 'publish', _fields: LISTING_FIELDS,
        });
        const rows: any[] = await get(`/products?${params}`, context);
        yield { entries: toEntries(rows), cursor: page + 1 };
        if (rows.length < PAGE_SIZE) return;
      }
    },
    fingerprint: wooReconcileFingerprint,
    // Both listings key on the numeric id, never the till-local uuid (#313).
    matchKey: (doc) => (Number.isInteger(doc.id) ? String(doc.id) : undefined),
    async confirmGone(locals, context) {
      const ids = locals.map((doc) => doc.id).filter((id) => Number.isInteger(id));
      // An empty include= would list the whole store; a local without a numeric id has no proof and is kept.
      if (!ids.length) return [];
      const params = new URLSearchParams({ include: ids.join(','), per_page: String(PAGE_SIZE), status: 'any', _fields: 'id,uuid,status' });
      const rows: Array<{ id: number; uuid: string; status: string }> = await get(`/products?${params}`, context);
      const live = new Map(rows.filter((row) => row.status === 'publish').map((row) => [row.id, typeof row.uuid === 'string' && row.uuid.length > 0 ? row.uuid : undefined]));
      // A live id backs only the store's uuid; other local copies are gone (#369).
      // A row without a uuid can't prove the local copy stale, so a live id keeps it (#375 review).
      return locals.filter((doc) => Number.isInteger(doc.id) && (!live.has(doc.id) || (typeof live.get(doc.id) === 'string' && live.get(doc.id) !== doc.uuid))).map((doc) => doc.uuid);
    },
    // An entry with no numeric id, locally or in the listing, is dropped: the store cannot be asked about it, so
    // the feed would find nothing and tombstone it without proof. (The schema requires only uuid.)
    enqueue: (entries) => feed.enqueue(entries.filter((e) => e.tombstone || Number.isInteger(e.local?.id) || Number.isInteger(e.remote))),
  };
}

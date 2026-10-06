import { createReconcileFeed, type CatalogueReconcileAdapter, type CatalogueReconcileEntry, type ReconcileFeed, type ReconcileFetchEntry, type SyncContext } from '@tallyui/core';
import { toCouponDocument } from '../replication/coupons';
import { checkResponse, wooProductUuid } from '../replication/products';
import { MAX_IDS_PER_REQUEST } from './feed';

/** The listing's page size, WordPress's per_page maximum. */
const PAGE_SIZE = 100;
/** The numeric id for refetching, and the fingerprint's fields. */
const LISTING_FIELDS = 'id,date_modified_gmt,usage_count,used_by';

/** Coupon usage never moves the modified time (ADR-077 amendment 2); numeric used_by ids match stored strings. */
export const wooCouponFingerprint = (c: { date_modified_gmt?: string | null; usage_count?: number | null; used_by?: readonly unknown[] | null }): string =>
  [c.date_modified_gmt ?? '', c.usage_count ?? '', JSON.stringify((c.used_by ?? []).map(String))].join('|');

async function get(path: string, context: SyncContext): Promise<any> {
  const response = await fetch(`${context.baseUrl}${path}`, {
    headers: { ...context.headers, 'Content-Type': 'application/json' },
    signal: context.signal,
  });
  await checkResponse(response);
  return response.json();
}

/**
 * Full coupons by numeric id (the till's own id, else the listing's remote). A draft arrives deleted;
 * a trashed coupon is absent from status=any, so the feed tombstones its local copy.
 */
export async function wooFetchCouponsByIds(entries: Array<ReconcileFetchEntry<any>>, context: SyncContext): Promise<any[]> {
  const ids = entries.map((e) => e.local?.id ?? e.remote).filter((id): id is number => Number.isInteger(id));
  const documents: any[] = [];
  for (let i = 0; i < ids.length; i += MAX_IDS_PER_REQUEST) {
    const chunk = ids.slice(i, i + MAX_IDS_PER_REQUEST);
    const params = new URLSearchParams({ include: chunk.join(','), per_page: String(MAX_IDS_PER_REQUEST), status: 'any' });
    const rows: any[] = await get(`/coupons?${params}`, context);
    documents.push(...rows.map(toCouponDocument).filter((doc) => doc !== undefined));
  }
  return documents;
}

/** Coupons reach the collection only through this feed, keyed by uuid and matched to new listing entries by id. */
export function createWooCouponFeed(): ReconcileFeed<any> {
  return createReconcileFeed<any>({ key: (doc) => doc.uuid, remote: (doc) => doc.id, fetchByIds: wooFetchCouponsByIds });
}

/** Listing rows keyed by numeric id; a row without an integer id cannot be asked about, and is dropped. */
const toEntries = (rows: any[]) => rows.filter((row) => Number.isInteger(row?.id))
  .map((row): CatalogueReconcileEntry => ({ key: String(row.id), fingerprint: wooCouponFingerprint(row), remote: row.id }));

/**
 * The coupons' only source (ADR-077 amendment 2): page through published coupons, with no date filter,
 * and hand differences to the feed. confirmGone proves deletion by re-reading the published listing by id.
 */
export function wooCouponReconcile(feed: Pick<ReconcileFeed<any>, 'enqueue'>): CatalogueReconcileAdapter<any, number> {
  return {
    async *fetchPages(context, from = 1) {
      for (let page = from; ; page++) {
        const params = new URLSearchParams({
          per_page: String(PAGE_SIZE), page: String(page), orderby: 'id', order: 'asc', status: 'publish', _fields: LISTING_FIELDS,
        });
        const rows: any[] = await get(`/coupons?${params}`, context);
        yield { entries: toEntries(rows), cursor: page + 1 };
        if (rows.length < PAGE_SIZE) return;
      }
    },
    fingerprint: wooCouponFingerprint,
    // The listing keys on the numeric id, never the till-local uuid.
    matchKey: (doc) => (Number.isInteger(doc.id) ? String(doc.id) : undefined),
    async confirmGone(locals, context) {
      const ids = locals.map((doc) => doc.id).filter((id) => Number.isInteger(id));
      // An empty include= would list the whole store; a local without a numeric id has no proof and is kept.
      if (!ids.length) return [];
      const live = new Map<number, string | undefined>();
      for (let i = 0; i < ids.length; i += MAX_IDS_PER_REQUEST) {
        const chunk = ids.slice(i, i + MAX_IDS_PER_REQUEST);
        const params = new URLSearchParams({ include: chunk.join(','), per_page: String(MAX_IDS_PER_REQUEST), _fields: 'id,meta_data' });
        const rows: any[] = await get(`/coupons?${params}`, context);
        for (const row of rows) live.set(row.id, wooProductUuid(row));
      }
      // A live id backs only the store's uuid (#369); a live row without a uuid keeps the local copy.
      return locals.filter((doc) => Number.isInteger(doc.id) && (!live.has(doc.id) || (typeof live.get(doc.id) === 'string' && live.get(doc.id) !== doc.uuid))).map((doc) => doc.uuid);
    },
    // Without an integer id, the feed would find nothing and tombstone without proof; proven tombstones pass.
    enqueue: (entries) => feed.enqueue(entries.filter((e) => e.tombstone || Number.isInteger(e.local?.id) || Number.isInteger(e.remote))),
  };
}

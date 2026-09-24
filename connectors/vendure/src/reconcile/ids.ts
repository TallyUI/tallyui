import type { SyncContext } from '@tallyui/core';
import { gql, PRODUCT_LIST_QUERY, toProductDocument } from '../replication/products';

/** Vendure Admin API maximum `take`; also the id-listing page size. */
const PAGE_SIZE = 1000;

const ID_LIST_QUERY = `
  query GetProductIds($options: ProductListOptions) {
    products(options: $options) { items { id variants { id } } totalItems }
  }
`;

/** Every live product id with its live variant ids, one request per page (ADR-060). */
export async function* fetchPages(context: SyncContext): AsyncIterable<Array<{ id: string; variantIds: string[] }>> {
  // total starts at 1 so the loop runs at least once, before totalItems is known.
  for (let skip = 0, total = 1; skip < total; skip += PAGE_SIZE) {
    const res = await gql(context, ID_LIST_QUERY, { options: { take: PAGE_SIZE, skip, sort: { id: 'ASC' } } });
    const { items, totalItems } = res.data.products as {
      items: Array<{ id: string; variants: Array<{ id: string }> }>; totalItems: number;
    };
    total = totalItems;
    yield items.map((p) => ({ id: String(p.id), variantIds: (p.variants ?? []).map((v) => String(v.id)) }));
  }
}

/** The variant ids a local product document lists. */
export function variantIds(doc: any): string[] {
  return (doc.variants ?? []).map((v: any) => String(v.id));
}

/** `fetchByIds` for `createReconcileFeed`, in the replication feeds' document shape. */
export function createFetchByIds(barcodeField?: string) {
  return async function fetchByIds(ids: string[], context: SyncContext): Promise<Record<string, unknown>[]> {
    if (!ids.length) return [];
    const res = await gql(context, PRODUCT_LIST_QUERY(barcodeField), { options: { take: ids.length, filter: { id: { in: ids } } } });
    return (res.data?.products?.items ?? []).map(toProductDocument);
  };
}

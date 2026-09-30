import { createReconcileFeed, type ReconcileFeed, type ReconcileFetchEntry, type SyncContext } from '@tallyui/core';
import { checkResponse, toProductDocument } from '../replication/products';

/** WordPress caps per_page at 100, so at most this many ids per include= request. */
export const MAX_IDS_PER_REQUEST = 100;

/**
 * `fetchByIds` for the reconcile feed (#248): full products by numeric id (the till's own `id`, else the
 * listing's `remote`), with `status=any` so that an unpublished product comes back and arrives deleted.
 * The pull's rules apply through `toProductDocument`.
 */
export async function wooFetchByIds(entries: Array<ReconcileFetchEntry<any>>, context: SyncContext): Promise<any[]> {
  const ids = entries.map((e) => e.local?.id ?? e.remote).filter((id): id is number => Number.isInteger(id));
  const documents: any[] = [];
  for (let i = 0; i < ids.length; i += MAX_IDS_PER_REQUEST) {
    const chunk = ids.slice(i, i + MAX_IDS_PER_REQUEST);
    const params = new URLSearchParams({ include: chunk.join(','), per_page: String(MAX_IDS_PER_REQUEST), status: 'any' });
    const response = await fetch(`${context.baseUrl}/products?${params}`, {
      headers: { ...context.headers, 'Content-Type': 'application/json' },
      signal: context.signal,
    });
    await checkResponse(response);
    documents.push(...(await response.json()).map(toProductDocument));
  }
  return documents;
}

/**
 * The reconcile feed for `products`, keyed by the primary key (`uuid`): the numeric `id` is only how the
 * store is asked (#248 design note, §6). Its corrections reach the collection only through the pull.
 */
export function createWooReconcileFeed(): ReconcileFeed<any> {
  return createReconcileFeed<any>({ key: (doc) => doc.uuid, fetchByIds: wooFetchByIds });
}

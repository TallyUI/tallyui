import type { MangoQuery, RxCollection } from 'rxdb';

/** Memory holds at most one page of documents. */
const MEASURE_PAGE_SIZE = 500;

export interface CollectionSize { docs: number; bytes: number }
export interface MeasureCollectionOptions { pageSize?: number; signal?: AbortSignal }

/**
 * Counts a collection's live documents and sums their data size in bytes.
 *
 * The size is the logical data size: each document's UTF-8 JSON without RxDB's metadata, not the
 * bytes on disk (no indexes, pages or WAL). Deleted documents are not counted.
 *
 * It reads every live document, a page at a time, so run it on demand, never on mount or in a hot
 * path. `signal` cancels it between pages.
 *
 * The pages are not one snapshot: a document written or removed while the walk runs may be missed
 * or counted, so under concurrent writes the totals are approximate.
 */
export async function measureCollectionBytes<T>(
  collection: RxCollection<T>,
  options: MeasureCollectionOptions = {},
): Promise<CollectionSize> {
  const pageSize = options.pageSize ?? MEASURE_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new RangeError(`pageSize must be an integer of at least 1, got ${pageSize}`);
  const primary = collection.schema.primaryPath as string;
  const encoder = new TextEncoder();
  const size: CollectionSize = { docs: 0, bytes: 0 };
  let last: unknown;
  for (;;) {
    options.signal?.throwIfAborted();
    const query = {
      selector: last === undefined ? {} : { [primary]: { $gt: last } },
      sort: [{ [primary]: 'asc' }],
      limit: pageSize,
    } as MangoQuery<T>;
    const { documents } = await collection.storageInstance.query(collection.find(query).getPreparedQuery());
    for (const document of documents) {
      const { _meta, _rev, _attachments, _deleted, ...data } = document;
      size.docs += 1;
      size.bytes += encoder.encode(JSON.stringify(data)).byteLength;
    }
    if (documents.length < pageSize) return size;
    last = (documents[documents.length - 1] as Record<string, unknown>)[primary];
  }
}

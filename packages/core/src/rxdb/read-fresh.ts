import { clone, type MangoQuery, type MangoQuerySelector, type RxCollection } from 'rxdb';

/**
 * Reads straight from the collection's storage, past RxDB's cached query result.
 *
 * Originally bypassed RxDB 16.21.1's bug 4, fixed in RxDB 17 (rxdb#7067) by snapshotting the
 * change counter before a read and rerunning when it moves. `readFresh`, `countFresh` and
 * `watchFresh` remain correct public API; retiring them is a separate decision.
 *
 * The prepared query is RxDB's own (`find(query).getPreparedQuery()`), so it already carries the
 * `_deleted: false` filter, the query's sort and its limit. The read goes through the same wrapped
 * storage instance an `RxQuery` uses, but skips `RxQuery` and `RxDocument`, so it is untested with
 * key compression and field encryption; no TallyUI collection uses either.
 *
 * Returns plain, deep-cloned document data without RxDB's metadata. Use `findOne(id)` for an
 * `RxDocument` to write through; its `incrementalModify` modifier sees the stored state.
 */
export async function readFresh<T>(collection: RxCollection<T>, query: MangoQuery<T>): Promise<T[]> {
  const { documents } = await collection.storageInstance.query(collection.find(query).getPreparedQuery());
  return documents.map((document) => {
    const { _meta, _rev, _attachments, _deleted, ...data } = clone(document);
    return data as T;
  });
}

/**
 * Counts straight from the collection's storage, past RxDB's cached count (see `readFresh`).
 * Unlike `count().exec()`, it doesn't refuse a storage that reports a slow count.
 */
export async function countFresh<T>(collection: RxCollection<T>, selector: MangoQuerySelector<T>): Promise<number> {
  return (await collection.storageInstance.count(collection.count({ selector }).getPreparedQuery())).count;
}

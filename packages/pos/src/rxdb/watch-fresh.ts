import { type Observable, startWith, switchMap } from 'rxjs';
import type { MangoQuery, RxCollection } from 'rxdb';
import { readFresh } from './read-fresh';

/**
 * A live list a cached `RxQuery` can't leave stale (bug 4 in the local RxDB 16.21.1 repro,
 * `readFresh`'s doc comment): a write during a query's storage read never reaches it, for good.
 * `collection.$` fires on every write and never touches that cache, so re-reading with `readFresh`
 * on subscribe and again on every `collection.$` event can't miss one; `switchMap` drops a read
 * still in flight when a newer one starts. Costs one storage read per collection change, so it's
 * for a list a cashier would act on going stale, not every list.
 */
export function watchFresh<T>(collection: RxCollection<T>, query: MangoQuery<T>): Observable<T[]> {
  return collection.$.pipe(
    startWith(null),
    switchMap(() => readFresh(collection, query)),
  );
}

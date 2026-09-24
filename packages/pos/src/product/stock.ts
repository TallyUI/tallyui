import type { RxCollection } from 'rxdb';
import { map, type Observable } from 'rxjs';

import { STOCK_LEVELS_LAST_PASS } from '@tallyui/core';

// The pure helpers live in core so components can use them without RxDB.
export { withStockOverlay, getProductStock } from '@tallyui/core';

/** The `stock_levels` collection as a live map of key to stock value. */
export function stockOverlay$(collection: RxCollection): Observable<Map<string, unknown>> {
  return collection.find().$.pipe(
    map((rows) => new Map(rows.map((row) => [row.primary, row.get('value')] as [string, unknown]))),
  );
}

/**
 * When the overlay was last confirmed by a successful pass (ISO 8601), or
 * undefined before any pass. Read from the collection's local document, so a
 * tab or screen that does not hold the runner can show it too.
 */
export function stockOverlayAsOf$(collection: RxCollection): Observable<string | undefined> {
  return collection.getLocal$<{ completedAt: string }>(STOCK_LEVELS_LAST_PASS).pipe(
    map((doc) => doc?.get('completedAt') as string | undefined),
  );
}

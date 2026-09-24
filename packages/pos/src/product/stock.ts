import type { RxCollection } from 'rxdb';
import { map, type Observable } from 'rxjs';

import type { ProductTraits, StockLevel, StockReconcileAdapter } from '@tallyui/core';

/**
 * A read-only view of `doc` with reconciled stock merged in (ADR-060).
 * Returns `doc` itself when there is nothing to merge; never mutates it.
 */
export function withStockOverlay<Doc>(
  doc: Doc,
  adapter: StockReconcileAdapter<Doc> | undefined,
  overlay: Map<string, unknown> | undefined,
): Doc {
  if (!adapter || !overlay) return doc;
  const fields = adapter.overlay(doc, overlay);
  return fields ? { ...doc, ...fields } : doc;
}

/**
 * The product's stock, from the overlay where it has an entry for a variant
 * or item, otherwise from the replicated document.
 */
export function getProductStock<Doc>(
  doc: Doc,
  traits: ProductTraits<Doc>,
  adapter: StockReconcileAdapter<Doc> | undefined,
  overlay: Map<string, unknown> | undefined,
): StockLevel {
  return traits.getStock(withStockOverlay(doc, adapter, overlay));
}

/** The `stock_levels` collection as a live map of key to stock value. */
export function stockOverlay$(collection: RxCollection): Observable<Map<string, unknown>> {
  return collection.find().$.pipe(
    map((rows) => new Map(rows.map((row) => [row.primary, row.get('value')] as [string, unknown]))),
  );
}

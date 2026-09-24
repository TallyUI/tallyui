import type { ProductTraits, StockLevel, StockReconcileAdapter } from './types';

/**
 * Local document id, in the `stock_levels` collection, that holds the time of
 * the last successful reconcile pass (`{ completedAt }`). Lives here so the
 * runner in `@tallyui/database` and the readers in `@tallyui/pos` share it.
 */
export const STOCK_LEVELS_LAST_PASS = 'last-pass';

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

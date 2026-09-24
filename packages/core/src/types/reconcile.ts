import type { SyncContext } from './connector';

/**
 * Re-reads stock from the backend, because replication misses stock changes
 * that bump no product timestamp (ADR-060). The runner stores `fetchPages`
 * output in the non-replicated `stock_levels` collection; readers merge it
 * into a read-only view of each product with `overlay`. Nothing is written
 * into the replicated products.
 */
export interface StockReconcileAdapter<Doc = any> {
  /** Current stock, one backend request per page, keyed as the connector chooses (variant, inventory item). */
  fetchPages(context: SyncContext): AsyncIterable<Map<string, unknown>>;
  /**
   * Pure: the fields of `doc` that `stock` changes, or undefined when nothing
   * differs. Keys absent from `stock` are left alone. The result is merged
   * into a read-only view of the document and never written.
   */
  overlay(doc: Doc, stock: Map<string, unknown>): Partial<Doc> | undefined;
}

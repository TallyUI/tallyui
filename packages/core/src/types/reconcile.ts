import type { SyncContext } from './connector';

/**
 * Re-reads stock from the backend and patches local product documents
 * whose stock differs (ADR-060). Replication misses stock changes that
 * bump no product timestamp; this pass corrects them.
 */
export interface StockReconcileAdapter<Doc = any> {
  /** Current stock, one backend request per page, keyed as the connector chooses (variant, inventory item). */
  fetchPages(context: SyncContext): AsyncIterable<Map<string, unknown>>;
  /** Fields to change on `doc` when its stock differs from `stock`; undefined when nothing differs. */
  patch(doc: Doc, stock: Map<string, unknown>): Partial<Doc> | undefined;
}

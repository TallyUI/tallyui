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

/** Catches a deleted product or a deleted variant that replication misses (ADR-060). Nothing is written locally: `enqueue` hands disagreeing documents to a `createReconcileFeed` pull adapter instead. */
export interface IdReconcileAdapter<Doc = any> {
  /** Every live product with its live variant ids, one backend request per page. */
  fetchPages(context: SyncContext): AsyncIterable<Array<{ id: string; variantIds: string[] }>>;
  /** The variant ids a local product document lists. */
  variantIds(doc: Doc): string[];
  /** Hand local documents that disagree with the backend to the collection's pull (see createReconcileFeed). */
  enqueue(entries: Array<{ id: string; local: Doc }>): void;
}

/** Re-delivers products whose remote fingerprint differs from the local one (ADR-060). */
export interface FingerprintReconcileAdapter<Doc = any> {
  /** Remote fingerprints by product id, one backend request per page. Products the backend doesn't report are left alone. */
  fetchPages(context: SyncContext): AsyncIterable<Map<string, string>>;
  /** The same fingerprint computed from a local product document. */
  fingerprint(doc: Doc): string;
  /**
   * Hands products to the collection's pull (the reconcile feed). `refreshOnly`
   * marks an entry so a missing product is skipped, never tombstoned: only the
   * id reconcile, with its mass-delete brake, may delete.
   */
  enqueue(entries: Array<{ id: string; local: Doc; refreshOnly?: boolean }>): void;
}

/** One product in the catalogue listing. `key` is the local primary key value; `remote` is whatever the connector needs to refetch it (a numeric backend id, say). */
export interface CatalogueReconcileEntry { key: string; fingerprint: string; remote?: unknown }

/**
 * The daily catalogue check (#248): one walk that refetches what differs and
 * deletes only with proof. Nothing is written locally: `enqueue` hands
 * documents to the collection's pull (the reconcile feed). `Cursor` must be
 * JSON-serialisable, since the runner persists it to resume a stopped pass.
 */
export interface CatalogueReconcileAdapter<Doc = any, Cursor = unknown> {
  /** Remote listing, one backend request per page, from `from` (a cursor this adapter yielded earlier) or the start. */
  fetchPages(context: SyncContext, from?: Cursor): AsyncIterable<{ entries: CatalogueReconcileEntry[]; cursor: Cursor }>;
  /** Pure: the same fingerprint from a local document. */
  fingerprint(doc: Doc): string;
  /**
   * Deletion proof, required: of these local documents (the ones the listing did not name), the keys
   * the backend confirms gone (absent, or no longer sellable). One or more requests. Only confirmed
   * keys are tombstoned; an adapter that never deletes returns none.
   */
  confirmGone(locals: Doc[], context: SyncContext): Promise<string[]>;
  /** Hand documents to the collection's pull (the reconcile feed). */
  enqueue(entries: Array<{ key: string; local?: Doc; remote?: unknown; tombstone?: boolean }>): void;
}

import type { RxCollection } from 'rxdb';
import type { IdReconcileAdapter, SyncContext } from '@tallyui/core';

import { startCatalogueRunner } from './catalogue-reconcile';
import { confirmAll, skipPages } from './fingerprint-reconcile';

export interface StartIdReconcileOptions<Doc> {
  /** The replicated products collection. Read only. */
  collection: RxCollection<Doc>;
  adapter: IdReconcileAdapter<Doc>;
  context: SyncContext;
  /** The app's `() => replication.reSync()`. */
  reSync: () => void;
  /** Delay before the first gate check (default 5000); `null` skips it and checks hourly. */
  startDelayMs?: number | null;
  /** Time from the last completed pass to the next (default 86400000, 24 hours). */
  intervalMs?: number;
  /** @deprecated Ignored: the request budget bounds a pass, so a large catalogue never truncates (#248). */
  maxPages?: number;
  /**
   * The brake applies once tombstones exceed this share of local
   * products (default 0.2), unless `allowMassDelete` is set.
   */
  maxDeleteShare?: number;
  /** Explicit override for a genuine purge; disables the mass-delete brake. */
  allowMassDelete?: boolean;
  /** The local document holding this runner's gate (default 'id-reconcile'). */
  stateId?: string;
}

/** `truncated` is always false now that no page cap applies. */
export interface IdReconcileResult { pages: number; queued: number; truncated: boolean; braked: boolean }

/**
 * Compares live product/variant ids against the local `products` collection
 * and queues disagreeing documents for the collection's pull (ADR-060), as a
 * wrapper over the catalogue runner (#248): a product whose variant ids differ
 * is refetched page by page; a product missing remotely is queued for deletion
 * only after an uninterrupted pass and under the mass-delete brake. Passes
 * follow the persisted daily gate within a request budget. A call during a
 * pass queues one follow-up pass (later calls share it).
 */
export function startIdReconcile<Doc>({
  adapter, reSync, startDelayMs = 5_000, maxPages: _ignored, stateId = 'id-reconcile', ...options
}: StartIdReconcileOptions<Doc>): { reconcileIds(): Promise<IdReconcileResult>; stop(): void } {
  const fingerprint = (ids: string[]) => [...ids].sort().join('\n');
  let queued = 0;
  let braked = false;
  let pending = false;
  const { request, stop } = startCatalogueRunner<Doc, number>({
    ...options, startDelayMs, stateId,
    // Only touch reSync when something reached the pull.
    reSync: () => { if (pending) { pending = false; reSync(); } },
    log: (event) => {
      if (event.type === 'pass-started') { queued = 0; braked = false; }
      if (event.type === 'kept' && event.reason === 'brake') braked = true;
    },
    adapter: {
      fetchPages: (context, from) => skipPages(adapter.fetchPages(context),
        (rows) => rows.map((row) => ({ key: row.id, fingerprint: fingerprint(row.variantIds) })), from),
      fingerprint: (doc) => fingerprint(adapter.variantIds(doc)),
      // The feed's request size, so the runner budgets a page's refetch by its requests (#307).
      refetchBatchSize: adapter.refetchBatchSize,
      // The proof is the feed's by-id re-read: every candidate is confirmed here and reaches the feed below as a
      // plain entry, never `tombstone: true`, so the feed tombstones it only when fetchByIds does not return it.
      confirmGone: confirmAll(options.collection),
      // The old entry shape. A product the till lacks is left to the pull, as before.
      enqueue: (entries) => {
        const known = entries.flatMap(({ key, local }) => (local ? [{ id: key, local }] : []));
        if (!known.length) return;
        queued += known.length;
        pending = true;
        adapter.enqueue(known);
      },
    },
  });
  // `.then` is attached at call time, so it reads this pass's counts before a follow-up starts.
  const reconcileIds = () => request().then(({ pages }) => ({ pages, queued, truncated: false, braked }));
  return { reconcileIds, stop };
}

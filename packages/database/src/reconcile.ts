import type { RxCollection } from 'rxdb';

import type { StockReconcileAdapter, SyncContext } from '@tallyui/core';

import type { StockLevelRow } from './stock-levels';

export interface StartStockReconcileOptions {
  /** The `stock_levels` collection. The runner writes nothing else. */
  collection: RxCollection<StockLevelRow>;
  adapter: StockReconcileAdapter;
  context: SyncContext;
  /** Time between passes in ms (default: 300000, 5 minutes) */
  intervalMs?: number;
  /** Most pages one pass reads; beyond it the pass is truncated (default: 100) */
  maxPages?: number;
}

export interface StockReconcileResult {
  pages: number;
  /** Rows inserted or changed */
  written: number;
  /** Rows whose key the backend no longer returns */
  removed: number;
  truncated: boolean;
}

/**
 * Periodically re-read stock into the `stock_levels` overlay collection (ADR-060).
 *
 * Replicated product documents are never written: a local write there makes
 * RxDB's downstream skip the next pulled version of that document.
 *
 * The first pass waits for the interval; the app calls reconcileStock() after
 * first paint and on foreground or resume. Concurrent calls share one pass.
 * stop() clears the timer and aborts a running pass.
 */
export function startStockReconcile({
  collection,
  adapter,
  context,
  intervalMs = 300_000,
  maxPages = 100,
}: StartStockReconcileOptions): { reconcileStock(): Promise<StockReconcileResult>; stop(): void } {
  const controller = new AbortController();
  const { signal } = controller;
  // React Native's AbortController polyfill has no throwIfAborted() and may have no reason.
  const checkAborted = () => {
    if (signal.aborted) throw signal.reason ?? new Error('Stock reconcile stopped');
  };
  let running: Promise<StockReconcileResult> | undefined;

  const pass = async (): Promise<StockReconcileResult> => {
    checkAborted();
    // Phase 1: read every page. A fetch that throws, is truncated or is
    // aborted writes nothing, so a partial snapshot never removes rows.
    const stock = new Map<string, unknown>();
    let pages = 0;
    for await (const page of adapter.fetchPages({ ...context, signal })) {
      checkAborted();
      if (pages === maxPages) {
        console.warn(`Stock reconcile stopped at the ${maxPages}-page limit; nothing was written.`);
        return { pages, written: 0, removed: 0, truncated: true };
      }
      pages++;
      for (const [key, value] of page) stock.set(key, value);
    }

    // Phase 2: write only rows that changed; remove keys the backend no longer returns.
    const rows = (await collection.find().exec()).map((doc) => doc.toJSON() as StockLevelRow);
    const stored = new Map(rows.map((row) => [row.id, JSON.stringify(row.value)]));
    const updatedAt = new Date().toISOString();
    const upserts = [...stock]
      .filter(([id, value]) => stored.get(id) !== JSON.stringify(value))
      .map(([id, value]) => ({ id, value, updatedAt }));
    const removals = rows.filter((row) => !stock.has(row.id)).map((row) => row.id);

    checkAborted();
    if (upserts.length) {
      const { error } = await collection.bulkUpsert(upserts);
      if (error.length) throw error[0];
    }
    if (removals.length) {
      const { error } = await collection.bulkRemove(removals);
      if (error.length) throw error[0];
    }
    return { pages, written: upserts.length, removed: removals.length, truncated: false };
  };

  const reconcileStock = () => (running ??= pass().finally(() => { running = undefined; }));
  const timer = setInterval(() => {
    reconcileStock().catch((error) => console.warn('Stock reconcile failed:', error));
  }, intervalMs);

  // stop() and an abort of context.signal both end the runner for good.
  const stop = () => {
    clearInterval(timer);
    context.signal?.removeEventListener('abort', stop);
    controller.abort();
  };
  if (context.signal?.aborted) stop();
  else context.signal?.addEventListener('abort', stop);

  return { reconcileStock, stop };
}

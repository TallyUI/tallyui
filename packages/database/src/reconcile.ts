import type { RxCollection } from 'rxdb';

import type { StockReconcileAdapter, SyncContext } from '@tallyui/core';

export interface StartStockReconcileOptions<Doc = any> {
  collection: RxCollection<Doc>;
  adapter: StockReconcileAdapter<Doc>;
  context: SyncContext;
  /** Time between passes in ms (default: 300000, 5 minutes) */
  intervalMs?: number;
  /** Most pages one pass reads; beyond it the pass is truncated (default: 100) */
  maxPages?: number;
}

export interface StockReconcileResult {
  pages: number;
  patched: number;
  truncated: boolean;
}

/**
 * Periodically re-read stock and patch local documents whose stock differs (ADR-060).
 *
 * The first pass waits for the interval; the app calls reconcileStock() after
 * first paint and on foreground or resume. Concurrent calls share one pass.
 */
export function startStockReconcile<Doc = any>({
  collection,
  adapter,
  context,
  intervalMs = 300_000,
  maxPages = 100,
}: StartStockReconcileOptions<Doc>): { reconcileStock(): Promise<StockReconcileResult>; stop(): void } {
  let running: Promise<StockReconcileResult> | undefined;

  const pass = async (): Promise<StockReconcileResult> => {
    // Read every page before writing: a fetch that throws or is truncated
    // leaves local documents untouched.
    const stock = new Map<string, unknown>();
    let pages = 0;
    for await (const page of adapter.fetchPages(context)) {
      if (pages === maxPages) return { pages, patched: 0, truncated: true };
      pages++;
      for (const [key, value] of page) stock.set(key, value);
    }
    const docs = await collection.find().exec();
    // Snapshots only pick candidates; each write recomputes the patch against
    // the latest data, so a concurrent replication write is never reverted.
    const candidates = docs.filter((doc) => adapter.patch(doc.toJSON() as Doc, stock));
    // Writes are best effort per document. Stock patches are idempotent, so
    // writes that succeeded stay and the next pass corrects any that failed;
    // the pass still rejects with the first write error.
    const results = await Promise.allSettled(candidates.map(async (doc) => {
      let changed = false;
      // The modifier can rerun on conflict; the last run decides.
      await doc.incrementalModify((data) => {
        const patch = adapter.patch(data as Doc, stock);
        changed = patch !== undefined;
        return patch ? { ...data, ...patch } : data;
      });
      return changed;
    }));
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) throw failed.reason;
    const patched = results.filter((r) => r.status === 'fulfilled' && r.value).length;
    return { pages, patched, truncated: false };
  };

  const reconcileStock = () => (running ??= pass().finally(() => { running = undefined; }));
  const timer = setInterval(() => {
    reconcileStock().catch((error) => console.warn('Stock reconcile failed:', error));
  }, intervalMs);

  return { reconcileStock, stop: () => clearInterval(timer) };
}

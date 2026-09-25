import type { RxCollection } from 'rxdb';
import { BehaviorSubject, type Observable } from 'rxjs';

import { STOCK_LEVELS_LAST_PASS, type StockReconcileAdapter, type SyncContext } from '@tallyui/core';

import { createPassQueue } from './pass-queue';
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
  /** ISO time of a successful pass; also stored in the `last-pass` local document. */
  completedAt?: string;
}

/** The runner's state. `lastCompletedAt` survives restarts; the rest is in memory. */
export interface StockReconcileState {
  lastCompletedAt?: string;
  running: boolean;
  truncated: boolean;
  lastError?: unknown;
}

/**
 * Periodically re-read stock into the `stock_levels` overlay collection (ADR-060).
 *
 * Replicated product documents are never written: a local write there makes
 * RxDB's downstream skip the next pulled version of that document.
 *
 * The first pass waits for the interval; the app calls reconcileStock() after
 * first paint and on foreground or resume. A call during a pass queues one
 * follow-up pass (later calls share it), so a change made after the pass
 * read is picked up straight after, not at the next interval. stop() clears
 * the timer and aborts a running pass.
 */
export function startStockReconcile({
  collection,
  adapter,
  context,
  intervalMs = 300_000,
  maxPages = 100,
}: StartStockReconcileOptions): {
  reconcileStock(): Promise<StockReconcileResult>;
  stop(): void;
  state$: Observable<StockReconcileState>;
} {
  const controller = new AbortController();
  const { signal } = controller;
  // React Native's AbortController polyfill has no throwIfAborted() and may have no reason.
  const checkAborted = () => {
    if (signal.aborted) throw signal.reason ?? new Error('Stock reconcile stopped');
  };
  const state = new BehaviorSubject<StockReconcileState>({ running: false, truncated: false });
  const update = (patch: Partial<StockReconcileState>) => state.next({ ...state.value, ...patch });
  // Every pass awaits this, so a collection without local documents (RxDB LD8) fails before fetching.
  const lastPass = collection.getLocal<{ completedAt: string }>(STOCK_LEVELS_LAST_PASS).catch((error) => {
    if (error?.code !== 'LD8') return null;
    throw new Error(`Create "${collection.name}" with stockLevelsCollection (localDocuments: true); stock reconcile stores its last pass there.`, { cause: error });
  });
  // Seed "as of" from the last successful pass before this start, unless a pass already set it.
  lastPass.then((doc) => {
    if (doc && !state.value.lastCompletedAt) update({ lastCompletedAt: doc.get('completedAt') });
  }, () => {});

  const pass = async (): Promise<StockReconcileResult> => {
    checkAborted();
    await lastPass;
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
    // Rows written by this pass carry the same time.
    const completedAt = updatedAt;
    checkAborted();
    await collection.upsertLocal(STOCK_LEVELS_LAST_PASS, { completedAt });
    return { pages, written: upserts.length, removed: removals.length, truncated: false, completedAt };
  };

  const tracked = async (): Promise<StockReconcileResult> => {
    update({ running: true });
    try {
      const result = await pass();
      if (result.truncated) update({ running: false, truncated: true });
      else state.next({ running: false, truncated: false, lastCompletedAt: result.completedAt });
      return result;
    } catch (error) {
      update({ running: false, lastError: error });
      throw error;
    }
  };
  const reconcileStock = createPassQueue(tracked);
  const timer = setInterval(() => {
    reconcileStock().catch((error) => console.warn('Stock reconcile failed:', error));
  }, intervalMs);

  // stop() and an abort of context.signal both end the runner for good.
  const stop = () => {
    clearInterval(timer);
    context.signal?.removeEventListener('abort', stop);
    controller.abort();
    state.complete();
  };
  if (context.signal?.aborted) stop();
  else context.signal?.addEventListener('abort', stop);

  return { reconcileStock, stop, state$: state.asObservable() };
}

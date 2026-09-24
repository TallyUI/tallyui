import type { RxCollection } from 'rxdb';
import type { IdReconcileAdapter, SyncContext } from '@tallyui/core';

export interface StartIdReconcileOptions<Doc> {
  /** The replicated products collection. Read only. */
  collection: RxCollection<Doc>;
  adapter: IdReconcileAdapter<Doc>;
  context: SyncContext;
  /** The app's `() => replication.reSync()`. */
  reSync: () => void;
  /** Delay before the first pass (default 5000); `null` skips it. */
  startDelayMs?: number | null;
  /** Time between passes in ms (default 86400000, 24 hours). */
  intervalMs?: number;
  /** Pages read before a pass is truncated (default 100). */
  maxPages?: number;
}

export interface IdReconcileResult { pages: number; queued: number; truncated: boolean }

/**
 * Compares live product/variant ids against the local `products` collection
 * and queues disagreeing documents for the collection's pull (ADR-060). Only
 * reads `collection`. A throw, abort or truncation queues nothing and skips
 * `reSync`; only a complete pass acts. One pass runs `startDelayMs` after
 * start, then every `intervalMs`; concurrent calls share one pass.
 */
export function startIdReconcile<Doc>({
  collection, adapter, context, reSync, startDelayMs = 5_000, intervalMs = 86_400_000, maxPages = 100,
}: StartIdReconcileOptions<Doc>): { reconcileIds(): Promise<IdReconcileResult>; stop(): void } {
  const controller = new AbortController();
  const { signal } = controller;
  // React Native's AbortController polyfill has no throwIfAborted() and may have no reason.
  const checkAborted = () => { if (signal.aborted) throw signal.reason ?? new Error('Id reconcile stopped'); };
  let running: Promise<IdReconcileResult> | undefined;

  const pass = async (): Promise<IdReconcileResult> => {
    checkAborted();
    // Phase 1: read every page first. A throw, abort or truncation here queues
    // nothing and skips reSync, so only a complete pass ever acts (ADR-060).
    const remote = new Map<string, string[]>();
    let pages = 0;
    for await (const page of adapter.fetchPages({ ...context, signal })) {
      checkAborted();
      if (pages === maxPages) {
        console.warn(`Id reconcile stopped at the ${maxPages}-page limit; nothing was queued.`);
        return { pages, queued: 0, truncated: true };
      }
      pages++;
      for (const row of page) remote.set(row.id, row.variantIds);
    }

    checkAborted();
    // Phase 2: queue local documents the backend no longer agrees with, either
    // missing entirely or listing a variant id that vanished remotely.
    const entries: Array<{ id: string; local: Doc }> = [];
    for (const doc of await collection.find().exec()) {
      const id = doc.primary as string;
      const remoteVariantIds = remote.get(id);
      const local = doc.toJSON() as Doc;
      const vanished = remoteVariantIds && adapter.variantIds(local).some((v) => !remoteVariantIds.includes(v));
      if (!remoteVariantIds || vanished) entries.push({ id, local });
    }

    checkAborted();
    // Only touch reSync when there is something for the pull to correct.
    if (entries.length) { adapter.enqueue(entries); reSync(); }
    return { pages, queued: entries.length, truncated: false };
  };

  const reconcileIds = () => (running ??= pass().finally(() => { running = undefined; }));
  const onTimer = () => reconcileIds().catch((error) => console.warn('Id reconcile failed:', error));
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  let intervalTimer: ReturnType<typeof setInterval>;
  const scheduleInterval = () => { intervalTimer = setInterval(onTimer, intervalMs); };
  // startDelayMs: null skips the start pass and goes straight to the nightly cadence.
  if (startDelayMs === null) scheduleInterval();
  else startTimer = setTimeout(() => { onTimer(); scheduleInterval(); }, startDelayMs);

  // stop() and an abort of context.signal both end the runner for good.
  const stop = () => {
    clearTimeout(startTimer);
    clearInterval(intervalTimer);
    context.signal?.removeEventListener('abort', stop);
    controller.abort();
  };
  if (context.signal?.aborted) stop();
  else context.signal?.addEventListener('abort', stop);

  return { reconcileIds, stop };
}

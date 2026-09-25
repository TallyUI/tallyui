import type { RxCollection } from 'rxdb';
import type { IdReconcileAdapter, SyncContext } from '@tallyui/core';

import { createPassQueue } from './pass-queue';

/**
 * Below this count of would-be tombstones, the brake never applies, whatever
 * `maxDeleteShare` says: in a small shop, deleting 2 of 5 products is normal.
 */
const MASS_DELETE_MINIMUM = 10;

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
  /**
   * The brake applies once would-be tombstones exceed this share of local
   * products (default 0.2), unless `allowMassDelete` is set.
   */
  maxDeleteShare?: number;
  /** Explicit override for a genuine purge; disables the mass-delete brake. */
  allowMassDelete?: boolean;
}

export interface IdReconcileResult { pages: number; queued: number; truncated: boolean; braked: boolean }

/**
 * Compares live product/variant ids against the local `products` collection
 * and queues disagreeing documents for the collection's pull (ADR-060). Only
 * reads `collection`. A throw, abort, truncation or the mass-delete brake
 * (below) queues nothing and skips `reSync`; only a complete, un-braked pass
 * acts. One pass runs `startDelayMs` after start, then every `intervalMs`. A
 * call during a pass queues one follow-up pass (later calls share it), so a
 * change made after the pass read is picked up straight after, not at the
 * next interval.
 */
export function startIdReconcile<Doc>({
  collection, adapter, context, reSync, startDelayMs = 5_000, intervalMs = 86_400_000, maxPages = 100,
  maxDeleteShare = 0.2, allowMassDelete = false,
}: StartIdReconcileOptions<Doc>): { reconcileIds(): Promise<IdReconcileResult>; stop(): void } {
  const controller = new AbortController();
  const { signal } = controller;
  // React Native's AbortController polyfill has no throwIfAborted() and may have no reason.
  const checkAborted = () => { if (signal.aborted) throw signal.reason ?? new Error('Id reconcile stopped'); };

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
        return { pages, queued: 0, truncated: true, braked: false };
      }
      pages++;
      for (const row of page) remote.set(row.id, row.variantIds);
    }

    checkAborted();
    // Phase 2: queue local documents the backend no longer agrees with, either
    // missing entirely (a tombstone) or listing a variant id that vanished
    // remotely. Tombstones are counted separately for the mass-delete brake.
    const entries: Array<{ id: string; local: Doc }> = [];
    let localCount = 0;
    let tombstones = 0;
    for (const doc of await collection.find().exec()) {
      localCount++;
      const id = doc.primary as string;
      const remoteVariantIds = remote.get(id);
      const local = doc.toJSON() as Doc;
      const vanished = remoteVariantIds && adapter.variantIds(local).some((v) => !remoteVariantIds.includes(v));
      if (!remoteVariantIds) tombstones++;
      if (!remoteVariantIds || vanished) entries.push({ id, local });
    }

    checkAborted();
    // The brake: a wrong channel token or a permissions change must never
    // empty a shop's catalogue. A catalogue that would vanish completely is
    // always suspicious, whatever its size. Otherwise, apply only when
    // tombstones are both a large share of the local catalogue and more than
    // the minimum that a small shop's normal churn can explain.
    if (!allowMassDelete && localCount > 0
      && (tombstones === localCount || (tombstones > MASS_DELETE_MINIMUM && tombstones > maxDeleteShare * localCount))) {
      const share = localCount ? tombstones / localCount : 1;
      console.warn(
        `Id reconcile braked: ${tombstones} of ${localCount} local products `
        + `(${(share * 100).toFixed(1)}%); nothing was queued. Pass allowMassDelete: true to override.`,
      );
      return { pages, queued: 0, truncated: false, braked: true };
    }

    // Only touch reSync when there is something for the pull to correct.
    if (entries.length) { adapter.enqueue(entries); reSync(); }
    return { pages, queued: entries.length, truncated: false, braked: false };
  };

  const reconcileIds = createPassQueue(pass);
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

import type { RxCollection } from 'rxdb';
import { BehaviorSubject, type Observable } from 'rxjs';

import type { FingerprintReconcileAdapter, SyncContext } from '@tallyui/core';

import { createPassQueue } from './pass-queue';

export interface StartFingerprintReconcileOptions<Doc> {
  /** The replicated collection. Read only. */
  collection: RxCollection<Doc>;
  adapter: FingerprintReconcileAdapter<Doc>;
  context: SyncContext;
  /** The app's `() => replication.reSync()`. */
  reSync: () => void;
  /** Delay before the first pass; `null` (default) skips it, since this runner is meant as a nightly backstop. */
  startDelayMs?: number | null;
  /** Time between passes in ms (default 86400000, 24 hours). */
  intervalMs?: number;
  /** Pages read before a pass is truncated (default 100). */
  maxPages?: number;
  /** Injection for tests; default Date.now. Stamps `lastResultAt`/`lastErrorAt`. */
  now?: () => number;
}

export interface FingerprintReconcileResult {
  pages: number;
  compared: number;
  queued: number;
  truncated: boolean;
  /**
   * Local products the remote side did not report in a complete pass (they are skipped); 0 on a truncated or failed
   * pass, and 0 when the adapter yielded no pages at all (e.g. base-only mode, no pricing context) -- that is not
   * the same as everything being unsellable. A channel that lists nothing still reads one empty page, so it
   * correctly reports everything as unreported.
   * For `calculatedPrices`, the products the sales channel does not list, which are not sellable here. A channel
   * misconfiguration shows up as a large number, not a silent empty till.
   */
  unreported: number;
}

/**
 * The runner's state; entirely in memory. The result is current only when
 * `lastResultAt > (lastErrorAt ?? 0)`; show `unreported` from a stale result
 * as stale. See `isFingerprintResultCurrent`.
 */
export interface FingerprintReconcileState {
  running: boolean;
  lastResult?: FingerprintReconcileResult;
  lastResultAt?: number;
  lastError?: unknown;
  lastErrorAt?: number;
}

/** True when `state.lastResult` is current, i.e. newer than the last failure, if any. */
export function isFingerprintResultCurrent(state: FingerprintReconcileState): boolean {
  return state.lastResultAt !== undefined && state.lastResultAt > (state.lastErrorAt ?? 0);
}

/**
 * Compares a remote fingerprint per product against the local `collection`
 * and queues disagreeing products for the collection's pull (ADR-060). Only
 * reads `collection`. A throw, abort or truncation queues nothing and skips
 * `reSync`; only a complete pass acts. Products the remote side doesn't
 * report are left alone -- deletions are the id reconcile's job. No pass
 * runs at start by default (`startDelayMs: null`); the app may still call
 * `reconcile()` on demand. A call during a pass queues one follow-up pass
 * (later calls share it), so a change made after the pass read is picked up
 * straight after, not at the next interval.
 */
export function startFingerprintReconcile<Doc>({
  collection, adapter, context, reSync, startDelayMs = null, intervalMs = 86_400_000, maxPages = 100, now = Date.now,
}: StartFingerprintReconcileOptions<Doc>): {
  reconcile(): Promise<FingerprintReconcileResult>;
  stop(): void;
  state$: Observable<FingerprintReconcileState>;
} {
  const controller = new AbortController();
  const { signal } = controller;
  // React Native's AbortController polyfill has no throwIfAborted() and may have no reason.
  const checkAborted = () => { if (signal.aborted) throw signal.reason ?? new Error('Fingerprint reconcile stopped'); };
  const state = new BehaviorSubject<FingerprintReconcileState>({ running: false });
  const update = (patch: Partial<FingerprintReconcileState>) => state.next({ ...state.value, ...patch });

  const pass = async (): Promise<FingerprintReconcileResult> => {
    checkAborted();
    // Phase 1: read every page first. A throw, abort or truncation here queues
    // nothing and skips reSync, so only a complete pass ever acts (ADR-060).
    const remote = new Map<string, string>();
    let pages = 0;
    for await (const page of adapter.fetchPages({ ...context, signal })) {
      checkAborted();
      if (pages === maxPages) {
        console.warn(`Fingerprint reconcile stopped at the ${maxPages}-page limit; nothing was queued.`);
        return { pages, compared: 0, queued: 0, truncated: true, unreported: 0 };
      }
      pages++;
      for (const [id, fingerprint] of page) remote.set(id, fingerprint);
    }

    checkAborted();
    // Phase 2: compare local documents the remote side reported against their
    // remote fingerprint. A product the remote side didn't report is skipped.
    const entries: Array<{ id: string; local: Doc; refreshOnly: true }> = [];
    let compared = 0;
    let unreported = 0;
    for (const doc of await collection.find().exec()) {
      const id = doc.primary as string;
      const remoteFingerprint = remote.get(id);
      if (remoteFingerprint === undefined) { if (pages > 0) unreported++; continue; }
      compared++;
      const local = doc.toJSON() as Doc;
      // refreshOnly: a missing re-fetch is skipped, never tombstoned -- deletions are the id reconcile's job (ADR-060).
      if (adapter.fingerprint(local) !== remoteFingerprint) entries.push({ id, local, refreshOnly: true });
    }

    checkAborted();
    // Only touch reSync when there is something for the pull to correct.
    if (entries.length) { adapter.enqueue(entries); reSync(); }
    return { pages, compared, queued: entries.length, truncated: false, unreported };
  };

  const tracked = async (): Promise<FingerprintReconcileResult> => {
    update({ running: true });
    try {
      const result = await pass();
      update({ running: false, lastResult: result, lastResultAt: now() });
      return result;
    } catch (error) {
      // lastResult (and lastResultAt) are left as they were: the app can tell it's stale via isFingerprintResultCurrent.
      update({ running: false, lastError: error, lastErrorAt: now() });
      throw error;
    }
  };

  const reconcile = createPassQueue(tracked);
  const onTimer = () => reconcile().catch((error) => console.warn('Fingerprint reconcile failed:', error));
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  let intervalTimer: ReturnType<typeof setInterval>;
  const scheduleInterval = () => { intervalTimer = setInterval(onTimer, intervalMs); };
  // startDelayMs: null (the default) skips the start pass and goes straight to the nightly cadence.
  if (startDelayMs === null) scheduleInterval();
  else startTimer = setTimeout(() => { onTimer(); scheduleInterval(); }, startDelayMs);

  // stop() and an abort of context.signal both end the runner for good.
  const stop = () => {
    clearTimeout(startTimer);
    clearInterval(intervalTimer);
    context.signal?.removeEventListener('abort', stop);
    controller.abort();
    state.complete();
  };
  if (context.signal?.aborted) stop();
  else context.signal?.addEventListener('abort', stop);

  return { reconcile, stop, state$: state.asObservable() };
}

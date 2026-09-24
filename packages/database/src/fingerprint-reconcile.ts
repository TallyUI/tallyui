import type { RxCollection } from 'rxdb';
import { BehaviorSubject, type Observable } from 'rxjs';

import type { FingerprintReconcileAdapter, SyncContext } from '@tallyui/core';

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
}

export interface FingerprintReconcileResult { pages: number; compared: number; queued: number; truncated: boolean }

/** The runner's state; entirely in memory. */
export interface FingerprintReconcileState {
  running: boolean;
  lastResult?: FingerprintReconcileResult;
  lastError?: unknown;
}

/**
 * Compares a remote fingerprint per product against the local `collection`
 * and queues disagreeing products for the collection's pull (ADR-060). Only
 * reads `collection`. A throw, abort or truncation queues nothing and skips
 * `reSync`; only a complete pass acts. Products the remote side doesn't
 * report are left alone -- deletions are the id reconcile's job. No pass
 * runs at start by default (`startDelayMs: null`); the app may still call
 * `reconcile()` on demand. Concurrent calls share one pass.
 */
export function startFingerprintReconcile<Doc>({
  collection, adapter, context, reSync, startDelayMs = null, intervalMs = 86_400_000, maxPages = 100,
}: StartFingerprintReconcileOptions<Doc>): {
  reconcile(): Promise<FingerprintReconcileResult>;
  stop(): void;
  state$: Observable<FingerprintReconcileState>;
} {
  const controller = new AbortController();
  const { signal } = controller;
  // React Native's AbortController polyfill has no throwIfAborted() and may have no reason.
  const checkAborted = () => { if (signal.aborted) throw signal.reason ?? new Error('Fingerprint reconcile stopped'); };
  let running: Promise<FingerprintReconcileResult> | undefined;
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
        return { pages, compared: 0, queued: 0, truncated: true };
      }
      pages++;
      for (const [id, fingerprint] of page) remote.set(id, fingerprint);
    }

    checkAborted();
    // Phase 2: compare local documents the remote side reported against their
    // remote fingerprint. A product the remote side didn't report is skipped.
    const entries: Array<{ id: string; local: Doc }> = [];
    let compared = 0;
    for (const doc of await collection.find().exec()) {
      const id = doc.primary as string;
      const remoteFingerprint = remote.get(id);
      if (remoteFingerprint === undefined) continue;
      compared++;
      const local = doc.toJSON() as Doc;
      if (adapter.fingerprint(local) !== remoteFingerprint) entries.push({ id, local });
    }

    checkAborted();
    // Only touch reSync when there is something for the pull to correct.
    if (entries.length) { adapter.enqueue(entries); reSync(); }
    return { pages, compared, queued: entries.length, truncated: false };
  };

  const tracked = async (): Promise<FingerprintReconcileResult> => {
    update({ running: true });
    try {
      const result = await pass();
      update({ running: false, lastResult: result });
      return result;
    } catch (error) {
      update({ running: false, lastError: error });
      throw error;
    }
  };

  const reconcile = () => (running ??= tracked().finally(() => { running = undefined; }));
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

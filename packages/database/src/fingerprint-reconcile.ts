import type { RxCollection } from 'rxdb';
import { BehaviorSubject, type Observable } from 'rxjs';

import type { CatalogueReconcileEntry, FingerprintReconcileAdapter, SyncContext } from '@tallyui/core';

import { startCatalogueRunner, type CatalogueReconcileSummary } from './catalogue-reconcile';

export interface StartFingerprintReconcileOptions<Doc> {
  /** The replicated collection. Read only. */
  collection: RxCollection<Doc>;
  adapter: FingerprintReconcileAdapter<Doc>;
  context: SyncContext;
  /** The app's `() => replication.reSync()`. */
  reSync: () => void;
  /** Delay before the first gate check; `null` (default) skips it and checks hourly. */
  startDelayMs?: number | null;
  /** Time from the last completed pass to the next (default 86400000, 24 hours). */
  intervalMs?: number;
  /** @deprecated Ignored: the request budget bounds a pass, so a large catalogue never truncates (#248). */
  maxPages?: number;
  /** Injection for tests; default Date.now. Stamps `lastResultAt`/`lastErrorAt`. */
  now?: () => number;
  /**
   * The local document holding this runner's gate (default 'fingerprint-reconcile').
   * Two fingerprint runners on one collection (prices and calculated prices) each need their own.
   */
  stateId?: string;
}

export interface FingerprintReconcileResult {
  pages: number;
  compared: number;
  queued: number;
  /** Always false now that no page cap applies. */
  truncated: boolean;
  /** True when `unreported` is a real count: a complete pass that read at least one page. */
  complete: boolean;
  /**
   * Local products the remote side did not report (`complete` marks a real count); 0 on a resumed
   * pass, and 0 when the adapter yielded no pages at all (e.g. base-only mode, no pricing context) -- that is not
   * the same as everything being unsellable. A channel that lists nothing still reads one empty page, so it
   * correctly reports everything as unreported.
   * For `calculatedPrices`, the products the sales channel does not list, which are not sellable here. A channel
   * misconfiguration shows up as a large number, not a silent empty till.
   */
  unreported: number;
}

/**
 * The runner's state; `lastCompleteAt` is persisted. The result is current only when
 * `lastResultAt > (lastErrorAt ?? 0)`; show `unreported` from a stale result
 * as stale. See `isFingerprintResultCurrent`.
 */
export interface FingerprintReconcileState {
  running: boolean;
  lastResult?: FingerprintReconcileResult;
  lastResultAt?: number;
  lastCompleteAt?: number;
  lastError?: unknown;
  lastErrorAt?: number;
}

/** True when `state.lastResult` is current, i.e. newer than the last failure, if any. */
export function isFingerprintResultCurrent(state: FingerprintReconcileState): boolean {
  return state.lastResultAt !== undefined && state.lastResultAt > (state.lastErrorAt ?? 0);
}

/**
 * The id wrapper's deletion proof: a pass-through that confirms every candidate. The wrapper hands
 * each to the reconcile feed as a plain `{ id, local }` entry, not a tombstone, and the feed's by-id
 * re-read (`fetchByIds`) tombstones only what does not come back: that refetch is the proof.
 */
export function confirmAll<Doc>(collection: RxCollection<Doc>) {
  const primary = collection.schema.primaryPath as string;
  return async (locals: Doc[]) => locals.map((doc) => (doc as Record<string, unknown>)[primary] as string);
}

/**
 * An old adapter's pages as catalogue pages. The cursor is the count of pages read. Old adapters
 * cannot start mid-way, so a resumed pass re-reads the pages before its cursor; each comes back
 * empty, so the runner takes a budget slot for its request but compares nothing, and counts it as a page.
 */
export async function* skipPages<Page>(
  pages: AsyncIterable<Page>, entries: (page: Page) => CatalogueReconcileEntry[], from = 0,
): AsyncIterable<{ entries: CatalogueReconcileEntry[]; cursor: number }> {
  let read = 0;
  for await (const page of pages) {
    read++;
    yield { entries: read <= from ? [] : entries(page), cursor: Math.max(read, from) };
  }
}

/**
 * Compares a remote fingerprint per product against the local `collection`
 * and queues disagreeing products for the collection's pull (ADR-060), as a
 * wrapper over the catalogue runner (#248). Never deletes: every entry is
 * `refreshOnly`, and a product the remote side doesn't report is only counted
 * as `unreported`. Passes follow the persisted daily gate within a request
 * budget; the app may still call `reconcile()` on demand. A call during a pass
 * queues one follow-up pass (later calls share it).
 */
export function startFingerprintReconcile<Doc>({
  adapter, reSync, startDelayMs = null, maxPages: _ignored, stateId = 'fingerprint-reconcile', ...options
}: StartFingerprintReconcileOptions<Doc>): {
  reconcile(): Promise<FingerprintReconcileResult>;
  stop(): void;
  state$: Observable<FingerprintReconcileState>;
} {
  let queued = 0;
  let pending = false;
  const { request, stop, state$: catalogue$ } = startCatalogueRunner<Doc, number>({
    ...options, startDelayMs, stateId, keepCandidates: true,
    // Only touch reSync when something reached the pull.
    reSync: () => { if (pending) { pending = false; reSync(); } },
    log: (event) => { if (event.type === 'pass-started') queued = 0; },
    adapter: {
      fetchPages: (context, from) => skipPages(adapter.fetchPages(context),
        (page) => [...page].map(([key, fingerprint]) => ({ key, fingerprint })), from),
      fingerprint: (doc) => adapter.fingerprint(doc),
      // The feed's request size, so the runner budgets a page's refetch by its requests (#307).
      refetchBatchSize: adapter.refetchBatchSize,
      // It never deletes: keepCandidates only counts the products the listing did not name (`unreported`), before the
      // brake and confirmGone, so this is never called; a call is a runner bug, and it fails the pass loudly.
      confirmGone: async () => { throw new Error('The fingerprint reconcile never deletes; confirmGone must not be called.'); },
      // refreshOnly: a missing re-fetch is skipped, never tombstoned (ADR-060). A product the till lacks is left to the pull.
      enqueue: (entries) => {
        const known = entries.flatMap(({ key, local }) => (local ? [{ id: key, local, refreshOnly: true as const }] : []));
        if (!known.length) return;
        queued += known.length;
        pending = true;
        adapter.enqueue(known);
      },
    },
  });
  const toResult = ({ pages, compared, unlisted, complete }: CatalogueReconcileSummary): FingerprintReconcileResult =>
    ({ pages, compared, queued, truncated: false, unreported: pages > 0 ? unlisted : 0, complete: complete && pages > 0 });

  // Mapped as each pass ends, while `queued` is still that pass's count.
  const state = new BehaviorSubject<FingerprintReconcileState>({ running: false });
  let summary: CatalogueReconcileSummary | undefined;
  let result: FingerprintReconcileResult | undefined;
  catalogue$.subscribe({
    next: ({ lastResult, ...rest }) => {
      if (lastResult !== summary) { summary = lastResult; result = lastResult && toResult(lastResult); }
      state.next(result ? { ...rest, lastResult: result } : rest);
    },
    complete: () => state.complete(),
  });
  // `.then` is attached at call time, so it reads this pass's counts before a follow-up starts.
  const reconcile = () => request().then(toResult);
  return { reconcile, stop, state$: state.asObservable() };
}

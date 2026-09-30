import type { MangoQuery, RxCollection } from 'rxdb';
import { BehaviorSubject, type Observable } from 'rxjs';

import { errorKind, type CatalogueReconcileAdapter, type SyncContext } from '@tallyui/core';
import { readFresh } from '@tallyui/core/rxdb';

import { BACKGROUND_CHUNK_SIZE, pauseBetweenChunks, readFreshInChunks } from './chunks';
import { createPassQueue } from './pass-queue';
import { MAX_RETRY_AFTER_MS, retryAfter } from './replication';

/**
 * Below this count of tombstones the brake never applies, whatever
 * `maxDeleteShare` says: in a small shop, deleting 2 of 5 products is normal.
 */
const MASS_DELETE_MINIMUM = 10;
/** The longest time between gate checks; a shorter interval checks at half of it (see `checkEveryMs`). */
const MAX_CHECK_EVERY_MS = 3_600_000;
/** The shortest time between gate checks, whatever `intervalMs` says. */
const MIN_CHECK_EVERY_MS = 60_000;
/** A transient error's first retry; it doubles, up to MAX_RETRY_AFTER_MS (1 hour). */
const FIRST_RETRY_MS = 5 * 60_000;
/** The request budget's window. */
const BUDGET_WINDOW_MS = 60_000;
/** Most keys one log event lists; `count` is always the full number. */
const LOG_KEYS = 50;
/** After a pull gap this long the app should call `reconcile()` (see `shouldReconcileAfterGap`). */
export const CATALOGUE_OFFLINE_GAP_MS = 6 * 3_600_000;

/** What a pass did, for the till's sync log (#248 A3). There is no cashier notice. */
export type CatalogueReconcileEvent =
  | { type: 'pass-started'; resumed: boolean }
  | { type: 'refetched'; count: number; keys: string[] }
  | { type: 'tombstoned'; count: number; keys: string[] }
  | { type: 'kept'; count: number; keys: string[]; reason: 'unconfirmed' | 'brake' | 'resumed-pass' }
  | ({ type: 'pass-completed' } & CatalogueReconcileSummary)
  | { type: 'stopped'; reason: 'till' | 'store' | 'transient' | 'stopped'; code?: string }
  | { type: 'skipped'; reason: 'gate' | 'store' };

export interface CatalogueReconcileSummary {
  pages: number;
  /** Listed documents the till holds. */
  compared: number;
  /** Differing or missing documents handed to the pull. */
  refetched: number;
  tombstoned: number;
  /** Deletion candidates kept: unconfirmed, or held by the brake. */
  kept: number;
  /** Local documents the listing did not name, counted in an uninterrupted pass (0 in a resumed one). */
  unlisted: number;
  durationMs: number;
}

/** In memory; the gate itself is persisted. `lastResult` is current when `lastResultAt > (lastErrorAt ?? 0)`. */
export interface CatalogueReconcileState {
  running: boolean;
  lastResult?: CatalogueReconcileSummary;
  lastResultAt?: number;
  lastError?: unknown;
  lastErrorAt?: number;
}

export interface StartCatalogueReconcileOptions<Doc, Cursor = unknown> {
  /** The replicated collection, created with `connectorCollection` (local documents on). Only read. */
  collection: RxCollection<Doc>;
  adapter: CatalogueReconcileAdapter<Doc, Cursor>;
  context: SyncContext;
  /** The app's `() => replication.reSync()`; called once per page that enqueued anything, and once for the tombstones. */
  reSync: () => void;
  /**
   * Requests allowed in any 60 s window (default 30): each page, each `confirmGone` chunk, and one for the refetch
   * each page that enqueued anything causes (the pull's `fetchByIds`; a connector fetching a page's ids in one request).
   */
  requestsPerMinute?: number;
  /** Most candidates per `confirmGone` call (default 100); each call takes one budget slot. */
  confirmChunk?: number;
  /** Time from the last completed pass to the next (default 86400000, 24 hours). */
  intervalMs?: number;
  /** The first gate check after start (default 120000); then one every `min(1 hour, intervalMs / 2)`, and at least a minute. */
  startDelayMs?: number;
  /** The brake holds deletion candidates above this share of local documents (and above 10), unless `allowMassDelete`. */
  maxDeleteShare?: number;
  allowMassDelete?: boolean;
  log?: (event: CatalogueReconcileEvent) => void;
  now?: () => number;
  /** The local document holding the gate and cursor (default 'catalogue-reconcile'); one per runner on a collection. */
  stateId?: string;
  /** Tests: schedules `fn` after `ms` and returns its cancel (default setTimeout). */
  setTimer?: (fn: () => void, ms: number) => () => void;
}

/** True when the last successful pull is older than `offlineGapMs`: the app should then call `reconcile()`. */
export function shouldReconcileAfterGap(lastPullAt: number | undefined, now = Date.now(), offlineGapMs = CATALOGUE_OFFLINE_GAP_MS): boolean {
  return lastPullAt !== undefined && now - lastPullAt > offlineGapMs;
}

interface PassState { startedAt: number; cursor?: unknown; uninterrupted: boolean }
interface Persisted { lastCompletedAt?: number; pass?: PassState }

// The state ids in use per collection: two runners sharing one would share a cursor.
const claimed = new WeakMap<object, Set<string>>();

/**
 * The daily catalogue check (#248, ADR-060). Walks the remote listing page by
 * page within a request budget, refetches what differs through the pull, and
 * deletes only after a pass that ran from first page to last in one go, only
 * what `confirmGone` confirms, and only under the mass-delete brake. Never
 * writes the collection; its gate and cursor live in a local document.
 */
export function startCatalogueReconcile<Doc, Cursor = unknown>(options: StartCatalogueReconcileOptions<Doc, Cursor>): {
  reconcile(): void;
  state$: Observable<CatalogueReconcileState>;
  stop(): void;
} {
  const { request, state$, stop } = startCatalogueRunner(options);
  // The runner logs and schedules every failure; only the wrappers need the promise.
  return { reconcile: () => { request().catch(() => {}); }, state$, stop };
}

/** The runner behind `startCatalogueReconcile` and the id and fingerprint wrappers; `request()` resolves with the pass. */
export function startCatalogueRunner<Doc, Cursor = unknown>({
  collection, adapter, context, reSync, requestsPerMinute = 30, confirmChunk = 100, intervalMs = 86_400_000, startDelayMs = 120_000,
  maxDeleteShare = 0.2, allowMassDelete = false, log = () => {}, now = Date.now, stateId = 'catalogue-reconcile',
  setTimer = (fn, ms) => { const timer = setTimeout(fn, ms); return () => clearTimeout(timer); }, keepCandidates = false,
}: Omit<StartCatalogueReconcileOptions<Doc, Cursor>, 'startDelayMs'> & {
  /** `null`: no start check, only the periodic ones. */
  startDelayMs?: number | null;
  /**
   * Never delete (the fingerprint wrapper): candidates are only counted as `unlisted`, before the
   * brake and confirmGone, so nothing is logged about them and no budget slot is taken.
   */
  keepCandidates?: boolean;
}) {
  const controller = new AbortController();
  const { signal } = controller;
  // React Native's AbortController polyfill has no throwIfAborted() and may have no reason.
  const checkAborted = () => { if (signal.aborted) throw signal.reason ?? new Error('Catalogue reconcile stopped'); };
  const ctx = { ...context, signal };
  const primary = collection.schema.primaryPath as string;
  const keyOf = (doc: Doc) => (doc as Record<string, unknown>)[primary] as string;
  const listed = (keys: string[]) => ({ count: keys.length, keys: keys.slice(0, LOG_KEYS) });
  const state = new BehaviorSubject<CatalogueReconcileState>({ running: false });
  const update = (patch: Partial<CatalogueReconcileState>) => state.next({ ...state.value, ...patch });

  // The gate and cursor: a local document, never replicated. A collection without local
  // documents, or a state id another runner holds, keeps them in memory instead.
  const ids = claimed.get(collection) ?? new Set<string>();
  claimed.set(collection, ids);
  const owner = !ids.has(stateId);
  let memory: Persisted | undefined;
  if (owner) ids.add(stateId);
  else {
    memory = {};
    console.warn(`Catalogue reconcile: "${stateId}" is in use on ${collection.name}; pass a distinct stateId. This gate is kept in memory.`);
  }
  const load = async (): Promise<Persisted> => {
    if (memory) return memory;
    try {
      const doc = await collection.getLocal<Persisted>(stateId);
      return doc ? { lastCompletedAt: doc.get('lastCompletedAt'), pass: doc.get('pass') } : {};
    } catch (error) {
      // LD8: local documents are off; no getLocal at all: the plugin was never added.
      if (typeof collection.getLocal === 'function' && (error as { code?: unknown } | null)?.code !== 'LD8') throw error;
      console.warn(`Catalogue reconcile: ${collection.name} has no local documents (create it with connectorCollection); the gate is kept in memory.`);
      return (memory = {});
    }
  };
  // JSON drops undefined fields and proves the cursor serialisable.
  const save = async (value: Persisted) => {
    if (memory) memory = value;
    else await collection.upsertLocal(stateId, JSON.parse(JSON.stringify(value)));
  };

  const sleep = (ms: number) => new Promise<void>((resolve) => {
    const onAbort = () => { cancel(); resolve(); };
    const cancel = setTimer(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal.addEventListener('abort', onAbort);
  });
  // The request budget: a sliding window of adapter calls, so no 60 s window holds more than
  // requestsPerMinute. Each page, each confirmGone call and each page's refetch counts as one. It bounds the pass, not a page cap.
  const sent: number[] = [];
  const budget = async () => {
    for (;;) {
      checkAborted();
      while (sent.length && sent[0] <= now() - BUDGET_WINDOW_MS) sent.shift();
      if (sent.length < requestsPerMinute) { sent.push(now()); return; }
      await sleep(sent[0] + BUDGET_WINDOW_MS - now());
    }
  };
  // Local copies of one page's keys, read fresh in bounded chunks that yield between reads.
  const readByKeys = async (keys: string[]) => {
    const found = new Map<string, Doc>();
    for (let i = 0; i < keys.length; i += BACKGROUND_CHUNK_SIZE) {
      if (i) await pauseBetweenChunks();
      checkAborted();
      const selector = { [primary]: { $in: keys.slice(i, i + BACKGROUND_CHUNK_SIZE) } };
      for (const doc of await readFresh(collection, { selector } as MangoQuery<Doc>)) found.set(keyOf(doc), doc);
    }
    return found;
  };
  // A wrong channel token or a permissions change must never empty a shop's catalogue.
  const braked = (tombstones: number, localCount: number) => !allowMassDelete && localCount > 0
    && (tombstones === localCount || (tombstones > MASS_DELETE_MINIMUM && tombstones > maxDeleteShare * localCount));

  const pass = async (): Promise<CatalogueReconcileSummary> => {
    checkAborted();
    const startedAt = now();
    const saved = await load();
    // A pass stopped within the interval resumes from its cursor. A resumed pass never
    // deletes: the keys it saw before it stopped are not kept.
    const resumed = Boolean(saved.pass && startedAt - saved.pass.startedAt < intervalMs);
    let current: PassState = resumed ? { ...saved.pass!, uninterrupted: false } : { startedAt, uninterrupted: true };
    await save({ lastCompletedAt: saved.lastCompletedAt, pass: current });
    log({ type: 'pass-started', resumed });

    const seen = new Set<string>();
    let pages = 0;
    let compared = 0;
    let refetched = 0;
    const iterator = adapter.fetchPages(ctx, current.cursor as Cursor)[Symbol.asyncIterator]();
    try {
      for (;;) {
        await budget();
        const next = await iterator.next();
        checkAborted();
        if (next.done) break;
        pages++;
        const { entries, cursor } = next.value;
        const locals = await readByKeys(entries.map((e) => e.key));
        const queue: Array<{ key: string; local?: Doc; remote?: unknown }> = [];
        for (const { key, fingerprint, remote } of entries) {
          seen.add(key);
          const local = locals.get(key);
          if (local) compared++;
          if (!local || adapter.fingerprint(local) !== fingerprint) queue.push({ key, local, remote });
        }
        checkAborted();
        if (queue.length) {
          // The refetch this page causes runs in the pull, outside the runner: its slot is taken before it is enqueued.
          await budget();
          adapter.enqueue(queue);
          reSync();
          refetched += queue.length;
          log({ type: 'refetched', ...listed(queue.map((e) => e.key)) });
        }
        current = { ...current, cursor };
        await save({ lastCompletedAt: saved.lastCompletedAt, pass: current });
      }
    } finally {
      iterator.return?.()?.catch(() => {});
    }

    let tombstoned = 0;
    let kept = 0;
    let unlisted = 0;
    const keep = (docs: Doc[], reason: 'unconfirmed' | 'brake') => {
      kept += docs.length;
      if (docs.length) log({ type: 'kept', ...listed(docs.map(keyOf)), reason });
    };
    if (!current.uninterrupted) log({ type: 'kept', count: 0, keys: [], reason: 'resumed-pass' });
    else {
      // Local documents the listing never named are candidates; only confirmed ones may go.
      const candidates: Doc[] = [];
      let localCount = 0;
      for await (const chunk of readFreshInChunks(collection)) {
        checkAborted();
        localCount += chunk.length;
        for (const doc of chunk) if (!seen.has(keyOf(doc))) candidates.push(doc);
      }
      unlisted = candidates.length;
      // The brake applies to the candidates, before confirmGone: a broken listing never sends
      // thousands of confirmation requests, and whatever confirmGone confirms stays under it.
      let gone: Doc[] = [];
      if (!candidates.length || keepCandidates) {
        // Nothing to prove, or nothing will ever be deleted: the candidates are only counted.
      } else if (braked(candidates.length, localCount)) {
        console.warn(
          `Catalogue reconcile braked: ${candidates.length} of ${localCount} local documents `
          + `(${((candidates.length / localCount) * 100).toFixed(1)}%) were kept. Pass allowMassDelete: true to override.`,
        );
        keep(candidates, 'brake');
      } else {
        // In chunks of confirmChunk, each taking one budget slot, so a connector never bursts.
        const confirmed = new Set<string>();
        for (let i = 0; i < candidates.length; i += confirmChunk) {
          const chunk = candidates.slice(i, i + confirmChunk);
          await budget();
          for (const key of await adapter.confirmGone(chunk, ctx)) confirmed.add(key);
          checkAborted();
        }
        gone = candidates.filter((doc) => confirmed.has(keyOf(doc)));
        const goneSet = new Set(gone);
        keep(candidates.filter((doc) => !goneSet.has(doc)), 'unconfirmed');
      }
      if (gone.length) {
        adapter.enqueue(gone.map((local) => ({ key: keyOf(local), local, tombstone: true })));
        reSync();
        tombstoned = gone.length;
        log({ type: 'tombstoned', ...listed(gone.map(keyOf)) });
      }
    }

    checkAborted();
    const lastCompletedAt = now();
    await save({ lastCompletedAt });
    const summary = { pages, compared, refetched, tombstoned, kept, unlisted, durationMs: lastCompletedAt - startedAt };
    log({ type: 'pass-completed', ...summary });
    return summary;
  };

  // Errors by who can fix them (errorKind). A stopped pass keeps its cursor and resumes.
  let failures = 0;
  let tillStopped = false;
  let cancelRetry: (() => void) | undefined;
  const onError = (error: unknown) => {
    if (signal.aborted) return log({ type: 'stopped', reason: 'stopped' });
    const kind = errorKind(error);
    // store: skipped until the next hourly check.
    if (kind === 'store') return log({ type: 'skipped', reason: 'store' });
    const code = (error as { code?: unknown } | null)?.code;
    log({ type: 'stopped', reason: kind, ...(typeof code === 'string' && { code }) });
    // till: no timer retries it; reconcile() (after sign-in) or the next start does.
    if (kind === 'till') { tillStopped = true; return; }
    // transient: a backoff from 5 minutes, doubling to an hour, or a longer valid retryAfterMs.
    const delay = Math.min(Math.max(FIRST_RETRY_MS * 2 ** failures++, retryAfter(error)), MAX_RETRY_AFTER_MS);
    cancelRetry = setTimer(() => { cancelRetry = undefined; run().catch(() => {}); }, delay);
  };
  const run = createPassQueue(async () => {
    update({ running: true });
    try {
      const result = await pass();
      failures = 0;
      update({ running: false, lastResult: result, lastResultAt: now() });
      return result;
    } catch (error) {
      update({ running: false, lastError: error, lastErrorAt: now() });
      onError(error);
      throw error;
    }
  });

  // The gate: a pass is due when none has completed within intervalMs, or one is pending resume.
  const check = async () => {
    if (tillStopped || cancelRetry || state.value.running) return;
    const { lastCompletedAt, pass: pending } = await load();
    if (pending || lastCompletedAt === undefined || now() - lastCompletedAt >= intervalMs) await run();
    else log({ type: 'skipped', reason: 'gate' });
  };
  // Hourly, or at half the interval when that is shorter, so a 30-minute runner runs every 30 minutes.
  // Never under a minute: a 0 or NaN interval would otherwise re-arm the check on every tick (NaN || 0 floors too).
  const checkEveryMs = Math.max(MIN_CHECK_EVERY_MS, Math.min(MAX_CHECK_EVERY_MS, intervalMs / 2) || 0);
  let cancelTimer = () => {};
  const schedule = (ms: number) => {
    cancelTimer = setTimer(() => {
      schedule(checkEveryMs);
      check().catch((error) => console.warn('Catalogue reconcile failed:', error));
    }, ms);
  };
  schedule(startDelayMs ?? checkEveryMs);

  // stop() and an abort of context.signal both end the runner for good.
  const stop = () => {
    cancelTimer();
    cancelRetry?.();
    if (owner) ids.delete(stateId);
    context.signal?.removeEventListener('abort', stop);
    controller.abort();
    state.complete();
  };
  if (context.signal?.aborted) stop();
  else context.signal?.addEventListener('abort', stop);

  /** Requests a pass now: it clears a till stop and a pending retry, and folds into a running pass. */
  const request = () => {
    tillStopped = false;
    cancelRetry?.();
    cancelRetry = undefined;
    return run();
  };
  return { request, state$: state.asObservable(), stop };
}

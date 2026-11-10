import { replicateRxCollection, type RxReplicationState } from 'rxdb/plugins/replication';
import type { RxCollection } from 'rxdb';
import { BehaviorSubject, EMPTY, filter, firstValueFrom, merge, type Observable, type Subscription } from 'rxjs';

import { errorKind, type ReplicationAdapter, type SyncContext, type SyncNotice } from '@tallyui/core';

import type { ConnectivityTracker } from './connectivity';

/** The longest backoff between pull retries, and a store error's wait: 5 minutes. */
export const MAX_RETRY_TIME_MS = 5 * 60 * 1000;

/**
 * The longest wait an error's `retryAfterMs` can ask for: 1 hour. `setTimeout`
 * fires at once past about 24.8 days and a NaN wait crashes RxDB's loop, so only
 * a finite `retryAfterMs >= 0` counts, and never beyond this.
 */
export const MAX_RETRY_AFTER_MS = 60 * 60 * 1000;

// A timer can fire a few milliseconds early against Date.now(): a store retry
// this close to its time is on time, not an early call to hold back.
const TIMER_SLACK_MS = 10;

declare const __DEV__: boolean | undefined;
/**
 * React Native's __DEV__, else NODE_ENV (a bundler replaces the literal `process.env.NODE_ENV`); false where neither
 * exists. Read at each start so that a test can switch it.
 */
const isDev = () => {
  if (typeof __DEV__ !== 'undefined') return Boolean(__DEV__);
  try { return process.env.NODE_ENV !== 'production'; } catch { return false; }
};

// The collection each adapter object replicates into while live (#307). One connector instance
// replicating into two databases at once is the static-export misuse: a shared reconcile feed.
const liveInto = new WeakMap<object, RxCollection<any>>();
const warned = new WeakSet<object>();

/** Development only: warns once per adapter started on a second collection while the first is live. Never throws. */
function watchShared(adapter: object, collection: RxCollection<any>): () => void {
  if (!isDev()) return () => {};
  const live = liveInto.get(adapter);
  if (!live) liveInto.set(adapter, collection);
  else if (live !== collection && !warned.has(adapter)) {
    warned.add(adapter);
    console.warn('TallyUI: one connector instance is replicating into two databases. Build a connector per store session '
      + '(createXConnector()); a shared instance can leak queued reconcile work across stores.');
  }
  return () => { if (liveInto.get(adapter) === collection) liveInto.delete(adapter); };
}

export interface StartReplicationOptions<RxDocType, CheckpointType = any> {
  collection: RxCollection<RxDocType>;
  adapter: ReplicationAdapter<RxDocType, CheckpointType>;
  context: SyncContext;
  /** Keep syncing after initial pull (default: true) */
  live?: boolean;
  /** Retry interval in ms on error (default: 5000) */
  retryTime?: number;
  /** Start immediately (default: true) */
  autoStart?: boolean;
  /** The backoff's ceiling and a store error's wait, in ms (default: MAX_RETRY_TIME_MS); tests shorten it. */
  maxRetryTimeMs?: number;
  /**
   * Fed with every pull and push outcome. While its update-required latch is set, the pull returns empty pages and a
   * push waits, neither calling the adapter (v2 sends nothing once latched). `resetUpdateRequired()` re-probes: the
   * pull asks the store again and a held push goes. `resume()` keeps the latch.
   */
  connectivity?: ConnectivityTracker;
}

/** RxDB's replication state plus the pull notice and a way to restart after a till error. */
export type TallyReplicationState<RxDocType, CheckpointType = any> = RxReplicationState<RxDocType, CheckpointType> & {
  /** A notice while a till or store error stops the pull; `undefined` otherwise. */
  notice$: Observable<SyncNotice | undefined>;
  /** Clears the notice, the gates and the backoff, and pulls again from the stored checkpoint. */
  resume(): Promise<void>;
};

/** A valid `retryAfterMs` on the error (a finite number >= 0), else 0. */
export function retryAfter(error: unknown): number {
  const value = (error as { retryAfterMs?: unknown } | null)?.retryAfterMs;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

type ProtocolEvents = NonNullable<RxReplicationState<any, any>['internalReplicationState']>['events'];

/**
 * Resolves once `ready()` holds or the replication is cancelled, waking on a pause change, the cancel and `wake$`.
 * The protocol's own `canceled` is set before a cancel awaits anything (17.5 replication-protocol/index.js 216), and
 * completes after, hence the check first and the default value.
 */
async function hold(events: ProtocolEvents, ready: () => boolean, wake$: Observable<unknown> = EMPTY) {
  const done = () => events.canceled.getValue() || ready();
  if (done()) return;
  await firstValueFrom(merge(events.paused, events.canceled, wake$).pipe(filter(done)), { defaultValue: undefined });
}

/** The notice for a till or store error, with the error's string `software`, `minVersion` and `fix`. */
function noticeFor(error: unknown, fixedBy: 'till' | 'store'): SyncNotice {
  const fields = error as Record<string, unknown>;
  const notice: SyncNotice = { code: fields.code as string, since: Date.now(), fixedBy };
  for (const key of ['software', 'minVersion', 'fix'] as const) {
    if (typeof fields[key] === 'string') notice[key] = fields[key] as string;
  }
  return notice;
}

/**
 * Start RxDB replication for a single collection using a ReplicationAdapter.
 *
 * Returns the RxReplicationState which exposes observables for monitoring
 * and methods like cancel(), awaitInSync(), reSync().
 */
export function startReplication<RxDocType, CheckpointType = any>({
  collection,
  adapter,
  context,
  live = true,
  retryTime = 5000,
  autoStart = true,
  maxRetryTimeMs = MAX_RETRY_TIME_MS,
  connectivity,
}: StartReplicationOptions<RxDocType, CheckpointType>): TallyReplicationState<RxDocType, CheckpointType> {
  // Pull errors fall in three classes by who can fix them (errorKind):
  // - till (sign in again): one notice, pause, and an empty page (RxDB stores no
  //   checkpoint for it), so it costs one request. Until resume() the handler
  //   returns empty pages without calling the adapter, because RxDB restarts a
  //   paused loop (start() on page visibility, reSync(), stream$).
  // - store (the owner fixes it elsewhere): one notice, then rethrown with the
  //   store delay. An earlier call rethrows the stored error without calling the
  //   adapter, with retryTime set to the time left, so RxDB retries exactly then.
  //   The first success clears the notice.
  // - transient: rethrown with a doubling delay, or retryAfterMs if longer.
  let state: RxReplicationState<RxDocType, CheckpointType> | undefined;
  const notice$ = new BehaviorSubject<SyncNotice | undefined>(undefined);
  let failures = 0;
  let tillStopped = false;
  let storeError: unknown;
  let storeRetryAt = 0;
  const setRetryTime = (ms: number) => {
    if (state) state.retryTime = ms;
  };
  const pullHandler = async (checkpoint: CheckpointType | undefined, batchSize: number) => {
    if (tillStopped) {
      void state?.pause();
      return { documents: [], checkpoint };
    }
    // Latched: an empty page, no request, and no pause. A pause while a push is in flight makes RxDB drop that push's
    // answer and send its rows again after the restart (17.5 replication-protocol/upstream.js), a doubled write.
    if (connectivity?.current().updateRequired) return { documents: [], checkpoint };
    const wait = storeRetryAt - Date.now();
    if (wait > TIMER_SLACK_MS) {
      setRetryTime(wait);
      throw storeError;
    }
    try {
      const result = await adapter.pull.handler(checkpoint, batchSize, context);
      connectivity?.recordSuccess();
      failures = 0;
      storeError = undefined;
      storeRetryAt = 0;
      if (notice$.getValue()?.fixedBy === 'store') notice$.next(undefined);
      setRetryTime(retryTime);
      return result;
    } catch (error) {
      connectivity?.recordFailure(error);
      const kind = errorKind(error);
      if (kind === 'transient') {
        const backoff = Math.min(retryTime * 2 ** failures++, maxRetryTimeMs);
        setRetryTime(Math.min(Math.max(backoff, retryAfter(error)), MAX_RETRY_AFTER_MS));
        throw error;
      }
      const code = (error as { code: string }).code;
      const current = notice$.getValue();
      // One notice per cause: a repeat keeps the first `since`; another cause replaces it.
      if (current?.code !== code || current.fixedBy !== kind) notice$.next(noticeFor(error, kind));
      if (kind === 'till') {
        tillStopped = true;
        void state?.pause();
        return { documents: [], checkpoint };
      }
      const delay = Math.min(Math.max(maxRetryTimeMs, retryAfter(error)), MAX_RETRY_AFTER_MS);
      storeError = error;
      storeRetryAt = Date.now() + delay;
      setRetryTime(delay);
      throw error;
    }
  };
  // A schema bump drops the documents (createTallyDatabase), so it must also
  // reset the checkpoint: RxDB migrates the old checkpoint with the collection.
  // A new identifier is a fresh meta instance, so the pull starts from nothing
  // (and a combined adapter seeds as on a fresh install). The old meta instance
  // is left orphaned: a few rows, and removing it is out of scope. Version 0
  // keeps the original identifier, so existing installs never resync.
  const { version } = collection.schema;
  const replication = replicateRxCollection({
    collection,
    replicationIdentifier: `${context.connectorId}-${collection.name}${version > 0 ? `-v${version}` : ''}`,
    pull: {
      handler: pullHandler,
      stream$: adapter.pull.stream$,
      batchSize: adapter.pull.batchSize,
    },
    push: adapter.push
      ? {
          // A push is held, never thrown or dropped, while latched or paused: before the send, and after it until
          // the pause ends. RxDB 17.5 drops a paused push's answer (plugins/replication/index.js 269, upstream.js
          // 287), so its rows go twice. And the pages queued behind it (upstream.js 90-100) then find no rows and
          // store the up checkpoint anyway (upstream.js 211), so those rows never go. Only a cancel ends a hold,
          // with nothing sent.
          handler: async (rows) => {
            const events = state!.internalReplicationState!.events;
            const latched = () => Boolean(connectivity?.current().updateRequired);
            await hold(events, () => !latched() && !events.paused.getValue(), connectivity?.snapshot$);
            if (events.canceled.getValue()) return [];
            const conflicts = await adapter.push!.handler(rows, context).catch((error: unknown) => {
              connectivity?.recordFailure(error);
              throw error;
            });
            connectivity?.recordSuccess();
            await hold(events, () => !events.paused.getValue());
            return conflicts;
          },
          batchSize: adapter.push.batchSize,
        }
      : undefined,
    live,
    retryTime,
    autoStart,
  });
  state = replication;
  // Cancelled or, for a one-shot replication, completed: RxDB cancels it either way.
  const release = watchShared(adapter, collection);
  // The re-probe (v2: a fresh engine re-probes the store, so only it clears the latch; apps/main/lib/create-app-engine.ts):
  // when the latch is reset, pull again from the checkpoint and re-run the push.
  let latched = Boolean(connectivity?.current().updateRequired);
  // Not while paused: an upstream pass run while paused sends nothing yet stores its checkpoint (upstream.js 211,
  // 287), and RxDB's start() re-syncs after a pause anyway (plugins/replication/index.js 110).
  const probe: Subscription | undefined = connectivity?.snapshot$.subscribe(({ updateRequired }) => {
    if (latched && !updateRequired && !tillStopped && !replication.isPaused()) replication.reSync();
    latched = updateRequired !== null;
  });
  replication.canceled$.subscribe((canceled) => {
    if (!canceled) return;
    release();
    probe?.unsubscribe();
  });
  const resume = async () => {
    notice$.next(undefined);
    tillStopped = false;
    storeError = undefined;
    storeRetryAt = 0;
    failures = 0;
    replication.retryTime = retryTime;
    await replication.start();
  };
  return Object.assign(replication, { notice$: notice$.asObservable(), resume });
}

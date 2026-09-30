import { replicateRxCollection, type RxReplicationState } from 'rxdb/plugins/replication';
import type { RxCollection } from 'rxdb';
import { BehaviorSubject, type Observable } from 'rxjs';

import { errorKind, type ReplicationAdapter, type SyncContext, type SyncNotice } from '@tallyui/core';

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
    const wait = storeRetryAt - Date.now();
    if (wait > TIMER_SLACK_MS) {
      setRetryTime(wait);
      throw storeError;
    }
    try {
      const result = await adapter.pull.handler(checkpoint, batchSize, context);
      failures = 0;
      storeError = undefined;
      storeRetryAt = 0;
      if (notice$.getValue()?.fixedBy === 'store') notice$.next(undefined);
      setRetryTime(retryTime);
      return result;
    } catch (error) {
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
          handler: (rows) => adapter.push!.handler(rows, context),
          batchSize: adapter.push.batchSize,
        }
      : undefined,
    live,
    retryTime,
    autoStart,
  });
  state = replication;
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

import { replicateRxCollection, type RxReplicationState } from 'rxdb/plugins/replication';
import type { RxCollection } from 'rxdb';
import { BehaviorSubject, type Observable } from 'rxjs';

import { isPermanentError, type ReplicationAdapter, type SyncContext, type SyncNotice } from '@tallyui/core';

/** The longest wait between pull retries: the doubling backoff stops at 5 minutes. */
export const MAX_RETRY_TIME_MS = 5 * 60 * 1000;

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
}

/** RxDB's replication state plus the permanent-error notice and a way to restart after one. */
export type TallyReplicationState<RxDocType, CheckpointType = any> = RxReplicationState<RxDocType, CheckpointType> & {
  /** Set once when a pull fails permanently (the pull is then paused); `undefined` otherwise. */
  notice$: Observable<SyncNotice | undefined>;
  /** Clears the notice and the backoff, and pulls again from the stored checkpoint. */
  resume(): Promise<void>;
};

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
}: StartReplicationOptions<RxDocType, CheckpointType>): TallyReplicationState<RxDocType, CheckpointType> {
  // A permanent error pauses the pull and returns an empty page (RxDB stores no
  // checkpoint for it), so it costs one request; a transient one is rethrown for
  // RxDB to retry after a doubling delay, or the error's retryAfterMs if longer.
  let state: RxReplicationState<RxDocType, CheckpointType> | undefined;
  const notice$ = new BehaviorSubject<SyncNotice | undefined>(undefined);
  let failures = 0;
  const pullHandler = async (checkpoint: CheckpointType | undefined, batchSize: number) => {
    try {
      const result = await adapter.pull.handler(checkpoint, batchSize, context);
      failures = 0;
      if (state) state.retryTime = retryTime;
      return result;
    } catch (error) {
      if (isPermanentError(error)) {
        if (!notice$.getValue()) notice$.next({ code: error.code, since: Date.now() });
        void state?.pause();
        return { documents: [], checkpoint };
      }
      const backoff = Math.min(retryTime * 2 ** failures++, MAX_RETRY_TIME_MS);
      const retryAfterMs = (error as { retryAfterMs?: unknown } | null)?.retryAfterMs;
      if (state) state.retryTime = typeof retryAfterMs === 'number' ? Math.max(backoff, retryAfterMs) : backoff;
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
    failures = 0;
    replication.retryTime = retryTime;
    await replication.start();
  };
  return Object.assign(replication, { notice$: notice$.asObservable(), resume });
}

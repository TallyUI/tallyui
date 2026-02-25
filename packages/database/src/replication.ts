import { replicateRxCollection, type RxReplicationState } from 'rxdb/plugins/replication';
import type { RxCollection } from 'rxdb';

import type { ReplicationAdapter, SyncContext } from '@tallyui/core';

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
}: StartReplicationOptions<RxDocType, CheckpointType>): RxReplicationState<RxDocType, CheckpointType> {
  return replicateRxCollection({
    collection,
    replicationIdentifier: `${context.connectorId}-${collection.name}`,
    pull: {
      handler: (checkpoint, batchSize) =>
        adapter.pull.handler(checkpoint as CheckpointType | undefined, batchSize, context),
      stream$: adapter.pull.stream$,
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
}

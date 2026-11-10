import type { RxReplicationPullStreamItem, RxReplicationWriteToMasterRow } from 'rxdb';
import type { Observable } from 'rxjs';

import type { SyncContext } from './connector';

/**
 * Replication adapter interface for a single collection.
 *
 * Each connector implements this to provide pull/push handlers
 * compatible with RxDB's replicateRxCollection protocol.
 *
 * CheckpointType is connector-specific (cursor, offset+timestamp, etc).
 */
export interface ReplicationAdapter<RxDocType, CheckpointType = any> {
  pull: {
    /**
     * Fetch documents changed since the last checkpoint.
     * Return an empty documents array when fully caught up.
     */
    handler: (
      lastCheckpoint: CheckpointType | undefined,
      batchSize: number,
      context: SyncContext
    ) => Promise<{
      documents: Array<RxDocType & { _deleted: boolean }>;
      checkpoint: CheckpointType;
    }>;

    /**
     * Documents per pull page, passed to handler as batchSize. RxDB treats a
     * shorter page as the end of the cycle. Defaults to RxDB's 100.
     */
    batchSize?: number;

    /**
     * Fresh install only: the checkpoint this feed starts from instead of a full first pass,
     * read before any feed runs (combinePullAdapters). Absent: a full first pass, as today.
     */
    seedCheckpoint?: (context: SyncContext) => Promise<CheckpointType>;

    /**
     * Optional real-time event stream.
     * Emit { documents, checkpoint } for live updates,
     * or 'RESYNC' to trigger a full pull cycle.
     */
    stream$?: Observable<RxReplicationPullStreamItem<RxDocType, CheckpointType>>;
  };

  /**
   * A push adapter must accept the same rows twice: a cancel after a send re-sends them. A direct RxDB `pause()`
   * before the first push starts, or RxDB 17.5 pausing a hidden non-leader tab when `multiInstance` is on
   * (`createTallyDatabase` turns it off and refuses it), still drops the queued rows unsent (#645).
   * `startReplication`'s own sign-in path holds instead of pausing.
   */
  push?: {
    /**
     * Push local changes to the remote API.
     * Return an array of conflict documents (server's version wins).
     * Return empty array if no conflicts.
     */
    handler: (
      changeRows: RxReplicationWriteToMasterRow<RxDocType>[],
      context: SyncContext
    ) => Promise<Array<RxDocType & { _deleted: boolean }>>;

    /** Max documents per push batch. Defaults to 100. */
    batchSize?: number;
  };
}

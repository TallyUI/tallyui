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
     * Optional real-time event stream.
     * Emit { documents, checkpoint } for live updates,
     * or 'RESYNC' to trigger a full pull cycle.
     */
    stream$?: Observable<RxReplicationPullStreamItem<RxDocType, CheckpointType>>;
  };

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

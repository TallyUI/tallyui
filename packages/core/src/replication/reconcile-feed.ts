import type { SyncContext } from '../types/connector';
import type { ReplicationAdapter } from '../types/replication';

/** At most this many ids per `fetchByIds` call (ADR-060). */
const MAX_CHUNK = 1000;

export interface ReconcileFeedEntry<Doc = any> {
  id: string;
  local: Doc;
  /**
   * Re-deliver if the product still exists; never tombstone if missing (the
   * fingerprint path, ADR-060). Only the id reconcile, with its mass-delete
   * brake, enqueues deletable entries.
   */
  refreshOnly?: boolean;
}
export interface CreateReconcileFeedOptions<Doc = any> {
  /** The current projected documents for the ids that still exist. */
  fetchByIds(ids: string[], context: SyncContext): Promise<Doc[]>;
}
export interface ReconcileFeed<Doc = any> {
  /** Pull-only; meant as the last key of `combinePullAdapters` so its fetch wins duplicates. */
  adapter: ReplicationAdapter<Doc, { n: number }>;
  /**
   * Add entries to the in-memory queue, de-duplicated by id, last entry's
   * `local` wins. `refreshOnly` is merged separately: it is true only when
   * every merged entry for that id was `refreshOnly`, so a deletable entry
   * (the id reconcile's) is never downgraded by a later refresh-only one.
   */
  enqueue(entries: Array<ReconcileFeedEntry<Doc>>): void;
}

/** Turns queued corrections into a pull adapter's documents; nothing here writes locally (ADR-060). */
export function createReconcileFeed<Doc = any>({ fetchByIds }: CreateReconcileFeedOptions<Doc>): ReconcileFeed<Doc> {
  let queue = new Map<string, ReconcileFeedEntry<Doc>>();
  // refreshOnly is true only if both the prior and the incoming entry were
  // refreshOnly: a deletable entry is never downgraded by a later refresh-only one.
  const merge = (prior: ReconcileFeedEntry<Doc> | undefined, e: ReconcileFeedEntry<Doc>): ReconcileFeedEntry<Doc> =>
    ({ ...e, refreshOnly: Boolean(e.refreshOnly) && (prior?.refreshOnly ?? true) });
  const enqueue = (entries: Array<ReconcileFeedEntry<Doc>>) => {
    for (const e of entries) queue.set(e.id, merge(queue.get(e.id), e));
  };

  const adapter: ReplicationAdapter<Doc, { n: number }> = {
    pull: {
      async handler(lastCheckpoint, _batchSize, context) {
        if (queue.size === 0) return { documents: [], checkpoint: lastCheckpoint ?? { n: 0 } };
        // Drain the whole queue; anything enqueued while this pass runs lands in the fresh map.
        const entries = [...queue.values()];
        queue = new Map();
        try {
          const documents: Array<Doc & { _deleted: boolean }> = [];
          // Fetch in chunks of at most MAX_CHUNK ids per call.
          for (let i = 0; i < entries.length; i += MAX_CHUNK) {
            const chunk = entries.slice(i, i + MAX_CHUNK);
            const fetched = await fetchByIds(chunk.map((e) => e.id), context);
            const byId = new Map(fetched.map((doc) => [(doc as { id?: unknown }).id, doc]));
            for (const entry of chunk) {
              const doc = byId.get(entry.id);
              if (doc) documents.push({ ...doc, _deleted: false });
              // A refreshOnly entry (the fingerprint path) is skipped, not tombstoned, when the
              // product is missing: only the id reconcile's braked entries may delete (ADR-060).
              else if (!entry.refreshOnly) documents.push({ ...entry.local, _deleted: true });
            }
          }
          return { documents, checkpoint: { n: (lastCheckpoint?.n ?? 0) + 1 } };
        } catch (error) {
          // Put entries back at the front; anything queued mid-fetch wins, merged
          // by the same rule, so a failed fetch never downgrades a deletable entry. RxDB retries.
          const restored = new Map(entries.map((e) => [e.id, e]));
          for (const [id, e] of queue) restored.set(id, merge(restored.get(id), e));
          queue = restored;
          throw error;
        }
      },
    },
  };
  return { adapter, enqueue };
}

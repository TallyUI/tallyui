import type { SyncContext } from '../types/connector';
import type { ReplicationAdapter } from '../types/replication';

/** At most this many ids per `fetchByIds` call (ADR-060). */
const MAX_CHUNK = 1000;

export interface ReconcileFeedEntry<Doc = any> { id: string; local: Doc }
export interface CreateReconcileFeedOptions<Doc = any> {
  /** The current projected documents for the ids that still exist. */
  fetchByIds(ids: string[], context: SyncContext): Promise<Doc[]>;
}
export interface ReconcileFeed<Doc = any> {
  /** Pull-only; meant as the last key of `combinePullAdapters` so its fetch wins duplicates. */
  adapter: ReplicationAdapter<Doc, { n: number }>;
  /** Add entries to the in-memory queue, de-duplicated by id, last entry wins. */
  enqueue(entries: Array<ReconcileFeedEntry<Doc>>): void;
}

/** Turns queued corrections into a pull adapter's documents; nothing here writes locally (ADR-060). */
export function createReconcileFeed<Doc = any>({ fetchByIds }: CreateReconcileFeedOptions<Doc>): ReconcileFeed<Doc> {
  let queue = new Map<string, ReconcileFeedEntry<Doc>>();
  const enqueue = (entries: Array<ReconcileFeedEntry<Doc>>) => { for (const e of entries) queue.set(e.id, e); };

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
              documents.push(doc ? { ...doc, _deleted: false } : { ...entry.local, _deleted: true });
            }
          }
          return { documents, checkpoint: { n: (lastCheckpoint?.n ?? 0) + 1 } };
        } catch (error) {
          // Put entries back at the front; anything queued mid-fetch wins. RxDB retries.
          const restored = new Map(entries.map((e) => [e.id, e]));
          for (const [id, e] of queue) restored.set(id, e);
          queue = restored;
          throw error;
        }
      },
    },
  };
  return { adapter, enqueue };
}

import type { SyncContext } from '../types/connector';
import type { ReplicationAdapter } from '../types/replication';

/** At most this many ids per `fetchByIds` call (ADR-060). */
const MAX_CHUNK = 1000;

/**
 * One queued correction, keyed by the local primary key: `key`, or `id`, its
 * older name. `local` is the till's copy, if it has one; `remote` is whatever
 * the connector needs to refetch it.
 */
export type ReconcileFeedEntry<Doc = any> = ({ key: string; id?: undefined } | { id: string; key?: undefined }) & {
  local?: Doc;
  remote?: unknown;
  /**
   * Re-deliver if the product still exists; never tombstone if missing (the
   * fingerprint path, ADR-060). Only the id reconcile, with its mass-delete
   * brake, enqueues deletable entries.
   */
  refreshOnly?: boolean;
  /** Proven gone (the catalogue reconcile, #248): written as deleted from `local`, without a fetch. */
  tombstone?: boolean;
};
/** What a keyed feed's `fetchByIds` receives for each entry. */
export interface ReconcileFetchEntry<Doc = any> { key: string; local?: Doc; remote?: unknown }
export interface CreateReconcileFeedOptions<Doc = any> {
  /** The current projected documents for the ids that still exist, matched back by `doc.id`. */
  fetchByIds(ids: string[], context: SyncContext): Promise<Doc[]>;
}
/** A feed keyed by the primary key where that is not `doc.id` (WooCommerce's uuid, #248). */
export interface KeyedReconcileFeedOptions<Doc = any> {
  /** The local primary key of a fetched document; fetched documents are matched to entries by it. */
  key(doc: Doc): string;
  /** The current documents for the entries that still exist. A document may carry `_deleted: true` (an unpublished product). */
  fetchByIds(entries: Array<ReconcileFetchEntry<Doc>>, context: SyncContext): Promise<Doc[]>;
}
export interface ReconcileFeed<Doc = any> {
  /** Pull-only; meant as the last key of `combinePullAdapters` so its fetch wins duplicates. */
  adapter: ReplicationAdapter<Doc, { n: number }>;
  /**
   * Add entries to the in-memory queue, de-duplicated by key, last entry wins.
   * `refreshOnly` is merged separately: it is true only when every merged
   * entry for that key was `refreshOnly`, so a deletable entry (the id
   * reconcile's) is never downgraded by a later refresh-only one.
   */
  enqueue(entries: Array<ReconcileFeedEntry<Doc>>): void;
}

/**
 * Turns queued corrections into a pull adapter's documents; nothing here writes locally (ADR-060).
 * Two overloads: with `key`, `fetchByIds` receives the entries and fetched documents are matched by
 * `key(doc)`; without it, `fetchByIds` receives bare ids and documents are matched by `doc.id`.
 */
export function createReconcileFeed<Doc = any>(options: KeyedReconcileFeedOptions<Doc>): ReconcileFeed<Doc>;
export function createReconcileFeed<Doc = any>(options: CreateReconcileFeedOptions<Doc>): ReconcileFeed<Doc>;
export function createReconcileFeed<Doc = any>(
  options: KeyedReconcileFeedOptions<Doc> | CreateReconcileFeedOptions<Doc>,
): ReconcileFeed<Doc> {
  const keyed = 'key' in options && typeof options.key === 'function' ? options : undefined;
  const docKey = keyed ? keyed.key : (doc: Doc) => (doc as { id?: unknown }).id;
  const fetch = (chunk: Array<ReconcileFeedEntry<Doc>>, context: SyncContext): Promise<Doc[]> => keyed
    ? keyed.fetchByIds(chunk.map((e) => ({ key: keyOf(e), local: e.local, remote: e.remote })), context)
    : (options as CreateReconcileFeedOptions<Doc>).fetchByIds(chunk.map(keyOf), context);
  let queue = new Map<string, ReconcileFeedEntry<Doc>>();
  // refreshOnly is true only if both the prior and the incoming entry were
  // refreshOnly: a deletable entry is never downgraded by a later refresh-only one.
  const merge = (prior: ReconcileFeedEntry<Doc> | undefined, e: ReconcileFeedEntry<Doc>): ReconcileFeedEntry<Doc> =>
    ({ ...e, refreshOnly: Boolean(e.refreshOnly) && (prior?.refreshOnly ?? true) });
  const enqueue = (entries: Array<ReconcileFeedEntry<Doc>>) => {
    for (const e of entries) queue.set(keyOf(e), merge(queue.get(keyOf(e)), e));
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
          // Fetch in chunks of at most MAX_CHUNK entries per call; a tombstone is never fetched.
          for (let i = 0; i < entries.length; i += MAX_CHUNK) {
            const chunk = entries.slice(i, i + MAX_CHUNK);
            const toFetch = chunk.filter((e) => !e.tombstone);
            const fetched = toFetch.length ? await fetch(toFetch, context) : [];
            const byKey = new Map(fetched.map((doc) => [docKey(doc), doc]));
            for (const entry of chunk) {
              const doc = entry.tombstone ? undefined : byKey.get(keyOf(entry));
              // A fetched document keeps a `_deleted` the connector set (an unpublished product, #248).
              if (doc) documents.push({ ...doc, _deleted: (doc as { _deleted?: boolean })._deleted ?? false });
              // A refreshOnly entry (the fingerprint path) is skipped, not tombstoned, when the
              // product is missing: only the id reconcile's braked entries may delete (ADR-060).
              // An entry with no local copy has nothing to delete.
              else if (!entry.refreshOnly && entry.local) documents.push({ ...entry.local, _deleted: true });
            }
          }
          return { documents, checkpoint: { n: (lastCheckpoint?.n ?? 0) + 1 } };
        } catch (error) {
          // Put entries back at the front; anything queued mid-fetch wins, merged
          // by the same rule, so a failed fetch never downgrades a deletable entry. RxDB retries.
          const restored = new Map(entries.map((e) => [keyOf(e), e]));
          for (const [key, e] of queue) restored.set(key, merge(restored.get(key), e));
          queue = restored;
          throw error;
        }
      },
    },
  };
  return { adapter, enqueue };
}

/** An entry's local primary key: `key`, or `id`, its older name. */
function keyOf(entry: ReconcileFeedEntry): string {
  return (entry.key ?? entry.id) as string;
}

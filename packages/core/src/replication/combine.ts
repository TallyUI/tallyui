import type { ReplicationAdapter } from '../types';

/**
 * Combine several pull adapters into the one adapter a collection replicates with.
 *
 * Run one replication per collection: two replications on one collection each
 * see the other's writes as local writes, so either can skip a pulled version.
 * Give a collection several feeds (products and variants, say) through this.
 *
 * The checkpoint is `{ [key]: subCheckpoint }`; each sub-adapter sees only its
 * own. `legacyKey` carries over an install's single-feed checkpoint: a stored
 * checkpoint with none of the keys becomes that key's checkpoint.
 *
 * Pull only: a sub-adapter with `push` or `pull.stream$` throws here.
 */
export function combinePullAdapters<Doc>(
  adapters: Record<string, ReplicationAdapter<Doc, any>>,
  options: { legacyKey?: string } = {},
): ReplicationAdapter<Doc, Record<string, any>> {
  const keys = Object.keys(adapters);
  for (const key of keys) {
    if (adapters[key].push || adapters[key].pull.stream$) {
      throw new Error(`combinePullAdapters: sub-adapter "${key}" has push or pull.stream$; only pull handlers can be combined.`);
    }
  }
  return {
    pull: {
      async handler(lastCheckpoint, batchSize, context) {
        let previous = lastCheckpoint;
        if (options.legacyKey && previous && typeof previous === 'object'
          && Object.keys(previous).length && !keys.some((key) => key in previous!)) {
          previous = { [options.legacyKey]: previous };
        }
        const byId = new Map<unknown, Doc & { _deleted: boolean }>();
        const checkpoint: Record<string, any> = {};
        // Call sub-adapters strictly one after another, in key order: a
        // correctness rule, not politeness. Each feed writes whole documents.
        // Sequential calls with the last duplicate winning mean every document
        // comes from the latest fetch of this call, and every fetch in the next
        // call happens after this call's writes. Concurrent feeds could let a
        // fetch made before another feed's newer write land after it and revert
        // it, with neither checkpoint ever revisiting the document.
        for (const key of keys) {
          const result = await adapters[key].pull.handler(previous?.[key], batchSize, context);
          for (const doc of result.documents) byId.set((doc as { id?: unknown }).id, doc);
          // RxDB merges only the top level of the combined checkpoint, so merge
          // each sub-checkpoint here as it would for a single adapter. Spread
          // keeps a sub-adapter's explicit undefined (cleared pass state).
          checkpoint[key] = { ...previous?.[key], ...result.checkpoint };
        }
        // Each sub-adapter returns unique ids, so one full sub-page makes the
        // combined page full: RxDB keeps pulling while any sub-adapter has more.
        return { documents: [...byId.values()], checkpoint };
      },
    },
  };
}

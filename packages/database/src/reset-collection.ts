import type { RxCollection } from 'rxdb';

import { startReplication, type StartReplicationOptions, type TallyReplicationState } from './replication';

/** The local document (on the collection itself) that holds its reset generation. */
export const REPLICATION_GENERATION_DOC = 'tally-replication-generation';

/** The collection's reset generation: 0 when it was never reset. Throws when the collection has no local documents. */
export async function replicationGeneration<RxDocType>(collection: RxCollection<RxDocType>): Promise<number> {
  try {
    const doc = await collection.getLocal<{ generation: number }>(REPLICATION_GENERATION_DOC);
    return doc ? doc.get('generation') : 0;
  } catch (error) {
    // LD8: local documents are off; no getLocal at all: the plugin was never added (as catalogue-reconcile.ts tells them apart).
    if (typeof collection.getLocal === 'function' && (error as { code?: unknown } | null)?.code !== 'LD8') throw error;
    throw new Error(`${collection.name} has no local documents; create it with connectorCollection`);
  }
}

export interface ResetCollectionOptions<RxDocType, CheckpointType = unknown> extends StartReplicationOptions<RxDocType, CheckpointType> {
  /** The running replication `startReplication` returned for these options. */
  state: TallyReplicationState<RxDocType, CheckpointType>;
  /** Local documents to remove with the data: the catalogue reconcile state. Default `['catalogue-reconcile']`. */
  reconcileStateIds?: string[];
}

/**
 * Clears the collection and downloads it again from the start, under the next generation. It returns the new
 * replication. Stop the collection's catalogue runner first and start it again afterwards. It refuses a collection
 * whose adapter pushes, since local writes would be lost.
 */
export async function resetCollection<RxDocType, CheckpointType = unknown>(
  options: ResetCollectionOptions<RxDocType, CheckpointType>,
): Promise<TallyReplicationState<RxDocType, CheckpointType>> {
  const { state, reconcileStateIds = ['catalogue-reconcile'], ...rest } = options;
  const { collection } = rest;
  // 1. Push: refuse before anything changes, since a reset would lose unpushed local writes.
  if (rest.adapter.push) throw new Error(`resetCollection: ${collection.name} pushes local writes; a reset would lose them`);
  // 2. Generation: read it (this throws, with nothing changed, when local documents are off).
  const n = await replicationGeneration(collection);
  // 3. Stop the running replication.
  await state.cancel();
  // 4. Persist the next generation before removing anything: a start after a stop between steps pulls from the start.
  await collection.upsertLocal(REPLICATION_GENERATION_DOC, { generation: n + 1 });
  // 5. Reconcile state: remove it, or the first pass after the reset reads the empty collection as everything deleted.
  for (const id of reconcileStateIds) await (await collection.getLocal(id))?.remove();
  // 6. Data: remove every document.
  await collection.find().remove();
  // 7. Restart under the new generation, a fresh checkpoint.
  return startReplication({ ...rest, generation: n + 1 });
}

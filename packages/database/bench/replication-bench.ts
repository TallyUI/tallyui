import { createRxDatabase, type RxJsonSchema } from 'rxdb';
import { replicateRxCollection } from 'rxdb/plugins/replication';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import type { Subscription } from 'rxjs';
import type { ReplicationAdapter, SyncContext } from '@tallyui/core';

export interface ReplicationBenchOptions<Doc, Checkpoint> {
  adapter: ReplicationAdapter<Doc, Checkpoint>;
  schema: RxJsonSchema<any>;
  context: SyncContext;
  collectionName?: string;
  batchSize?: number;
}

export interface ReplicationBenchResult {
  documents: number;
  requests: number;
  totalMs: number;
  docsPerSecond: number;
  peakHeapMB: number;
  batchSize: number;
}

export async function runReplicationBench<Doc, Checkpoint>(
  options: ReplicationBenchOptions<Doc, Checkpoint>,
): Promise<ReplicationBenchResult> {
  const { adapter, schema, context, collectionName = 'items', batchSize = 100 } = options;
  const name = `bench_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const db = await createRxDatabase({ name, storage: getRxStorageMemory(), multiInstance: false });
  const collections = await db.addCollections({ [collectionName]: { schema } });
  const collection = collections[collectionName];
  let requests = 0;
  let peakHeap = 0;
  const sampleHeap = () => {
    peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
  };

  const startedAt = performance.now();
  const state = replicateRxCollection<Doc, Checkpoint>({
    collection,
    replicationIdentifier: `bench-${name}`,
    pull: {
      async handler(checkpoint, n) {
        requests++;
        const result = await adapter.pull.handler(checkpoint, n, context);
        sampleHeap();
        return result;
      },
      batchSize,
    },
    live: false,
    autoStart: true,
    retryTime: 1000,
  });
  let errorSubscription: Subscription | undefined;
  const firstError = new Promise<never>((_, reject) => {
    errorSubscription = state.error$.subscribe(reject);
  });

  try {
    await Promise.race([state.awaitInitialReplication(), firstError]);
    const totalMs = Math.round((performance.now() - startedAt) * 10) / 10;
    const documents = await collection.count().exec();
    sampleHeap();
    const result: ReplicationBenchResult = {
      documents,
      requests,
      totalMs,
      docsPerSecond: totalMs === 0 ? 0 : Math.round(documents / (totalMs / 1000)),
      peakHeapMB: Math.round((peakHeap / 1024 / 1024) * 10) / 10,
      batchSize,
    };
    await state.cancel();
    await db.remove();
    return result;
  } catch (error) {
    // RxDB 16 retries failed pulls forever; cleanup queues behind the unfinished
    // start, so run both as fire-and-forget best effort to reject immediately.
    void state.cancel().catch(() => {});
    void db.remove().catch(() => {});
    throw error;
  } finally {
    errorSubscription?.unsubscribe();
  }
}

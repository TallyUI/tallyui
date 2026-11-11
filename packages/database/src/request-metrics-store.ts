import type { RxCollection, RxDatabase, RxJsonSchema } from 'rxdb';

import { REQUEST_METRICS_MAX_BUCKETS, type RequestMetrics, type RequestMetricsBucket } from './request-metrics';

// WCPOS v2's MetricsPersistenceBridge (`apps/main/app/(app)/_layout.tsx`) keeps the whole bucket array under one RxDB
// state key. Here each hour is its own row, so a write touches only the hours that changed.

/** The request metrics of this device. The host adds the collection as `request_metrics`, as with `sync_cadence`. */
export const REQUEST_METRICS_COLLECTION = 'request_metrics';
/** v2 METRICS_PERSIST_INTERVAL_MS. */
export const REQUEST_METRICS_PERSIST_INTERVAL_MS = 300_000;

export interface RequestMetricsDoc extends RequestMetricsBucket {
  /** String(hourStartMs): the primary key. */
  hour: string;
}

const COUNT = { type: 'integer', minimum: 0 } as const;
const AMOUNT = { type: 'number', minimum: 0 } as const;

// Local only: never replicated, never made with connectorCollection().
export const requestMetricsSchema: RxJsonSchema<RequestMetricsDoc> = {
  version: 0, primaryKey: 'hour', type: 'object', additionalProperties: false,
  properties: {
    hour: { type: 'string', maxLength: 16 },
    hourStartMs: COUNT, requests: COUNT, bytes: AMOUNT, durationTotalMs: AMOUNT, durationCount: COUNT, errors: COUNT,
    loadLast: { type: 'number' }, loadMax: { type: 'number' },
  },
  required: ['hour', 'hourStartMs', 'requests', 'bytes', 'durationTotalMs', 'durationCount', 'errors'],
};

export function requestMetricsCollection(): { readonly schema: RxJsonSchema<RequestMetricsDoc> } {
  return { schema: requestMetricsSchema } as const;
}
export type RequestMetricsCollection = RxCollection<RequestMetricsDoc>;

export async function addRequestMetricsCollection(db: RxDatabase): Promise<RequestMetricsCollection> {
  const added = await db.addCollections({ [REQUEST_METRICS_COLLECTION]: requestMetricsCollection() });
  return added[REQUEST_METRICS_COLLECTION] as RequestMetricsCollection;
}

export interface RequestMetricsPersistence {
  /** Resolves once the stored rows have been hydrated into the counter. */
  readonly ready: Promise<void>;
  /** Write the changed hours now, and delete rows beyond the newest REQUEST_METRICS_MAX_BUCKETS. */
  flush(): Promise<void>;
  /** Stop the timer, then flush once. Idempotent; later flushes are no-ops. */
  stop(): Promise<void>;
}

const FIELDS = [
  'hourStartMs', 'requests', 'bytes', 'durationTotalMs', 'durationCount', 'errors', 'loadLast', 'loadMax',
] as const;

/** The bucket fields of a row or bucket, with an optional load reading only when it is defined (RxDB rejects undefined). */
function toBucket(source: Readonly<RequestMetricsBucket>): RequestMetricsBucket {
  const bucket = {} as Record<string, number>;
  for (const key of FIELDS) if (source[key] !== undefined) bucket[key] = source[key];
  return bucket as unknown as RequestMetricsBucket;
}

const sameBucket = (a: RequestMetricsBucket, b: RequestMetricsBucket): boolean => FIELDS.every((key) => a[key] === b[key]);

export function persistRequestMetrics(
  metrics: RequestMetrics, collection: RequestMetricsCollection, options: { everyMs?: number } = {},
): RequestMetricsPersistence {
  /** What this persistence last wrote (or read) per hour, so a flush writes only the hours that differ. */
  const written = new Map<number, RequestMetricsBucket>();

  const ready = (async () => {
    const rows = (await collection.find().exec()).map((doc) => toBucket(doc.toJSON()));
    for (const row of rows) written.set(row.hourStartMs, row);
    metrics.hydrate(rows);
  })();
  // A rejected read surfaces through `ready` and every flush; this only keeps it from being reported as unhandled.
  ready.catch(() => undefined);

  const write = async (): Promise<void> => {
    await ready;
    const buckets = metrics.buckets();
    const changed = buckets.filter((bucket) => {
      const last = written.get(bucket.hourStartMs);
      return !last || !sameBucket(last, bucket);
    });
    if (changed.length > 0) {
      const docs = changed.map((bucket) => ({ hour: String(bucket.hourStartMs), ...toBucket(bucket) }));
      const result = await collection.bulkUpsert(docs);
      for (const doc of result.success) written.set(doc.hourStartMs, toBucket(doc.toJSON()));
      if (result.error.length > 0) throw new Error(`request metrics: ${result.error.length} hour(s) not written`);
    }
    // The counter keeps the newest REQUEST_METRICS_MAX_BUCKETS by count; a stored row older than its oldest is gone.
    if (buckets.length < REQUEST_METRICS_MAX_BUCKETS) return;
    const oldest = buckets[0].hourStartMs;
    await collection.find({ selector: { hourStartMs: { $lt: oldest } } }).remove();
    for (const hour of written.keys()) if (hour < oldest) written.delete(hour);
  };

  // Flushes run one at a time: each waits for the one before it, whether that succeeded or not.
  let tail: Promise<void> = Promise.resolve();
  const enqueue = (): Promise<void> => {
    const run = tail.then(write);
    tail = run.catch(() => undefined);
    return run;
  };

  let stopping: Promise<void> | undefined;
  // A failed timed flush is retried by the next tick; the caller of flush() or stop() sees its own failure.
  const timer = setInterval(() => void enqueue().catch(() => undefined),
    options.everyMs ?? REQUEST_METRICS_PERSIST_INTERVAL_MS);

  return {
    ready,
    flush: () => (stopping ? Promise.resolve() : enqueue()),
    stop() {
      stopping ??= (() => {
        clearInterval(timer);
        return enqueue();
      })();
      return stopping;
    },
  };
}

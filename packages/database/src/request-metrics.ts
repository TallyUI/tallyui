import { BehaviorSubject, type Observable } from 'rxjs';

// WCPOS v2's hourly request metrics (`apps/main/lib/metrics.ts`) and the part of its engine fetcher that feeds them
// (`apps/main/lib/engine-fetcher.ts`). One instance per store session: a host makes a new one on a store switch, so
// v2's epoch and reset are not needed.

export const REQUEST_METRICS_HOUR_MS = 3_600_000;
/** Hourly buckets kept: the newest 48 that exist, by count not age (an idle hour makes no bucket). v2 metrics.ts:4. */
export const REQUEST_METRICS_MAX_BUCKETS = 48;

export interface RequestMetricsBucket {
  hourStartMs: number;
  requests: number;
  bytes: number;
  durationTotalMs: number;
  durationCount: number;
  errors: number;
  loadLast?: number;
  loadMax?: number;
}

/**
 * One completed request attempt.
 *
 * `errors` counts failed request ATTEMPTS, not records: one queued record can contribute several and then leave the
 * queue acknowledged, so reconciling it against the sync backlog is a category error. `failed` is the settled
 * verdict, not the raw HTTP status, and a request we cancelled is not a failure.
 */
export interface RequestAttempt { atMs: number; durationMs: number; bytes: number; failed: boolean }

export interface RequestMetrics {
  record(attempt: RequestAttempt): void;
  /** Ignored unless finite. Lands in the bucket of `atMs` (default now()). */
  recordServerLoad(load1: number, atMs?: number): void;
  /** Sorted by hour, ascending; copies. */
  buckets(): RequestMetricsBucket[];
  /** Emits buckets() now and after every change. */
  readonly buckets$: Observable<RequestMetricsBucket[]>;
  /** Folds persisted buckets into the live ones (v2 hydrateMetricsBuckets); invalid entries skipped. */
  hydrate(persisted: unknown): void;
}

const REQUIRED_NUMBERS = ['hourStartMs', 'requests', 'bytes', 'durationTotalMs', 'durationCount', 'errors'] as const;
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function isRequestMetricsBucket(value: unknown): value is RequestMetricsBucket {
  if (!value || typeof value !== 'object') return false;
  const bucket = value as Record<string, unknown>;
  if (!REQUIRED_NUMBERS.every((key) => isFiniteNumber(bucket[key]))) return false;
  return (bucket.loadLast === undefined || isFiniteNumber(bucket.loadLast))
    && (bucket.loadMax === undefined || isFiniteNumber(bucket.loadMax));
}

export function createRequestMetrics(options: { now?: () => number } = {}): RequestMetrics {
  const now = options.now ?? Date.now;
  const map = new Map<number, RequestMetricsBucket>();

  const buckets = (): RequestMetricsBucket[] =>
    [...map.values()].sort((a, b) => a.hourStartMs - b.hourStartMs).map((bucket) => ({ ...bucket }));
  const subject = new BehaviorSubject<RequestMetricsBucket[]>([]);

  const getOrCreateBucket = (atMs: number): RequestMetricsBucket => {
    const start = Math.floor(atMs / REQUEST_METRICS_HOUR_MS) * REQUEST_METRICS_HOUR_MS;
    let bucket = map.get(start);
    if (!bucket) {
      bucket = { hourStartMs: start, requests: 0, bytes: 0, durationTotalMs: 0, durationCount: 0, errors: 0 };
      map.set(start, bucket);
    }
    return bucket;
  };

  // Prune, then publish: every change ends here.
  const commit = (): void => {
    const hours = [...map.keys()].sort((a, b) => a - b);
    for (const start of hours.slice(0, -REQUEST_METRICS_MAX_BUCKETS)) map.delete(start);
    subject.next(buckets());
  };

  return {
    record({ atMs, durationMs, bytes, failed }) {
      const bucket = getOrCreateBucket(atMs);
      bucket.requests += 1;
      // Guard against a malformed byte count leaking in from any caller: a single NaN or negative value would
      // otherwise corrupt this bucket's running total.
      if (Number.isFinite(bytes) && bytes >= 0) bucket.bytes += bytes;
      bucket.durationTotalMs += durationMs;
      bucket.durationCount += 1;
      if (failed) bucket.errors += 1;
      commit();
    },
    recordServerLoad(load1, atMs) {
      if (!Number.isFinite(load1)) return;
      const bucket = getOrCreateBucket(atMs ?? now());
      bucket.loadLast = load1;
      bucket.loadMax = Math.max(bucket.loadMax ?? load1, load1);
      commit();
    },
    buckets,
    buckets$: subject.asObservable(),
    hydrate(persisted) {
      if (!Array.isArray(persisted)) return;
      let changed = false;
      for (const bucket of persisted) {
        if (!isRequestMetricsBucket(bucket)) continue;
        changed = true;
        const existing = map.get(bucket.hourStartMs);
        if (!existing) {
          map.set(bucket.hourStartMs, { ...bucket });
          continue;
        }
        // The sync engine can open the current hour's bucket with startup requests before this (async) hydrate
        // resolves. Fold the persisted counts into the live bucket rather than skipping it, so earlier-in-the-hour
        // totals from a previous session survive the restart instead of being dropped.
        existing.requests += bucket.requests;
        existing.bytes += bucket.bytes;
        existing.durationTotalMs += bucket.durationTotalMs;
        existing.durationCount += bucket.durationCount;
        existing.errors += bucket.errors;
        if (bucket.loadMax !== undefined) existing.loadMax = Math.max(existing.loadMax ?? bucket.loadMax, bucket.loadMax);
        // Keep the live reading when the session has already recorded one (it is the most recent); otherwise fall
        // back to the persisted last reading.
        if (existing.loadLast === undefined && bucket.loadLast !== undefined) existing.loadLast = bucket.loadLast;
      }
      if (changed) commit();
    },
  };
}

export interface MeteredFetchOptions {
  /** Default: !response.ok && response.status !== 304. */
  isFailure?: (response: Response) => boolean;
  /** Read this header as a server-load reading (WCPOS: 'X-Server-Load'). Default: not read. */
  serverLoadHeader?: string;
  now?: () => number;
}

// A 304 is a conditional poll answered from cache: a healthy request, not an amber hour.
const defaultIsFailure = (response: Response): boolean => !response.ok && response.status !== 304;

/** The header's value is a JSON array of load averages; its first entry is the reading. Anything else is ignored. */
function parseServerLoad(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && isFiniteNumber(parsed[0]) ? parsed[0] : undefined;
  } catch {
    // Malformed server diagnostics must not affect the request.
    return undefined;
  }
}

/** Wraps `fetch` so each request lands in `metrics`. The response is returned as is, unread. */
export function meteredFetch(
  fetch: typeof globalThis.fetch, metrics: RequestMetrics, options: MeteredFetchOptions = {},
): typeof globalThis.fetch {
  const now = options.now ?? Date.now;
  const isFailure = options.isFailure ?? defaultIsFailure;
  return async (input, init) => {
    const start = now();
    let response: Response;
    try {
      response = await fetch(input, init);
    } catch (error) {
      // An abort is OUR cancellation (a superseded request, a scope switch): it counts as a request that happened and
      // never as a fault, or the hour turns amber with nothing in the log to explain it.
      const aborted = (error as { name?: unknown } | null)?.name === 'AbortError' || init?.signal?.aborted === true;
      metrics.record({ atMs: start, durationMs: now() - start, bytes: 0, failed: !aborted });
      throw error;
    }
    const contentLength = Number(response.headers.get('content-length'));
    // A malformed or negative content-length (a broken server or proxy) must not poison the hourly byte totals.
    const bytes = Number.isFinite(contentLength) && contentLength >= 0 ? contentLength : 0;
    metrics.record({ atMs: start, durationMs: now() - start, bytes, failed: isFailure(response) });
    if (options.serverLoadHeader !== undefined) {
      const load = parseServerLoad(response.headers.get(options.serverLoadHeader));
      if (load !== undefined) metrics.recordServerLoad(load, start);
    }
    return response;
  };
}

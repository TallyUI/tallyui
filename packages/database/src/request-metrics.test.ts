import { describe, expect, it } from 'vitest';

import {
  createRequestMetrics, isRequestMetricsBucket, meteredFetch, REQUEST_METRICS_HOUR_MS as HOUR_MS,
  type RequestMetricsBucket,
} from './request-metrics';

const bucketAt = (hourStartMs: number, extra: Partial<RequestMetricsBucket> = {}): RequestMetricsBucket => ({
  hourStartMs, requests: 0, bytes: 0, durationTotalMs: 0, durationCount: 0, errors: 0, ...extra,
});

function track(metrics: ReturnType<typeof createRequestMetrics>): RequestMetricsBucket[][] {
  const emissions: RequestMetricsBucket[][] = [];
  metrics.buckets$.subscribe((value) => emissions.push(value));
  return emissions;
}

// Ported from v2 apps/main/lib/metrics.test.ts, adapted to an instance with an injected clock.
describe('request metrics buckets (v2 cases)', () => {
  it('accumulates transport and server-load metrics in hourly buckets', () => {
    const metrics = createRequestMetrics({ now: () => 2 * HOUR_MS + 30_000 });
    metrics.record({ atMs: 2 * HOUR_MS + 1_000, durationMs: 25, bytes: 120, failed: false });
    metrics.record({ atMs: 2 * HOUR_MS + 2_000, durationMs: 75, bytes: 30, failed: true });
    metrics.recordServerLoad(0.5);
    metrics.recordServerLoad(0.3);

    expect(metrics.buckets()).toEqual([
      bucketAt(2 * HOUR_MS, {
        requests: 2, bytes: 150, durationTotalMs: 100, durationCount: 2, errors: 1, loadLast: 0.3, loadMax: 0.5,
      }),
    ]);
  });

  it('keeps only the newest 48 hourly buckets', () => {
    const metrics = createRequestMetrics();
    for (let hour = 0; hour < 50; hour += 1) {
      metrics.record({ atMs: hour * HOUR_MS, durationMs: hour, bytes: hour, failed: false });
    }
    const buckets = metrics.buckets();
    expect(buckets).toHaveLength(48);
    expect(buckets[0]?.hourStartMs).toBe(2 * HOUR_MS);
    expect(buckets[47]?.hourStartMs).toBe(49 * HOUR_MS);
  });

  it('ignores malformed byte counts instead of poisoning the bucket total', () => {
    const metrics = createRequestMetrics();
    metrics.record({ atMs: 2 * HOUR_MS, durationMs: 10, bytes: 100, failed: false });
    metrics.record({ atMs: 2 * HOUR_MS, durationMs: 10, bytes: Number.NaN, failed: false });
    metrics.record({ atMs: 2 * HOUR_MS, durationMs: 10, bytes: -50, failed: false });
    metrics.record({ atMs: 2 * HOUR_MS, durationMs: 10, bytes: 25, failed: false });
    const [bucket] = metrics.buckets();
    expect(bucket?.requests).toBe(4);
    expect(bucket?.bytes).toBe(125);
  });

  it('folds persisted counts into a live hour the engine already opened on startup', () => {
    const metrics = createRequestMetrics();
    // A startup request opens the current hour before the async hydrate resolves.
    metrics.record({ atMs: 2 * HOUR_MS, durationMs: 10, bytes: 20, failed: false });
    metrics.hydrate([
      bucketAt(HOUR_MS, {
        requests: 3, bytes: 40, durationTotalMs: 50, durationCount: 3, errors: 1, loadLast: 0.2, loadMax: 0.4,
      }),
      bucketAt(2 * HOUR_MS, { requests: 99, bytes: 99, durationTotalMs: 99, durationCount: 99, errors: 99 }),
    ]);

    expect(metrics.buckets()).toEqual([
      // A brand-new hour is taken verbatim from persistence.
      bucketAt(HOUR_MS, {
        requests: 3, bytes: 40, durationTotalMs: 50, durationCount: 3, errors: 1, loadLast: 0.2, loadMax: 0.4,
      }),
      // The already-open hour keeps the live request AND the persisted counts.
      bucketAt(2 * HOUR_MS, { requests: 100, bytes: 119, durationTotalMs: 109, durationCount: 100, errors: 99 }),
    ]);
  });

  it('prefers the live server-load reading and takes the max when merging an hour', () => {
    const metrics = createRequestMetrics({ now: () => 5 * HOUR_MS + 10 });
    metrics.recordServerLoad(0.5); // opens the current hour with a live reading
    const currentHour = metrics.buckets()[0]?.hourStartMs ?? 0;
    metrics.hydrate([bucketAt(currentHour, { loadLast: 0.1, loadMax: 0.9 })]);
    const [bucket] = metrics.buckets();
    expect(bucket?.loadLast).toBe(0.5); // live reading wins
    expect(bucket?.loadMax).toBe(0.9); // max across live + persisted
  });
});

describe('request metrics buckets', () => {
  it('puts an attempt on either side of an hour edge in its own bucket', () => {
    const metrics = createRequestMetrics();
    metrics.record({ atMs: 7_199_999, durationMs: 1, bytes: 0, failed: false });
    metrics.record({ atMs: 7_200_000, durationMs: 1, bytes: 0, failed: false });
    expect(metrics.buckets().map((bucket) => bucket.hourStartMs)).toEqual([3_600_000, 7_200_000]);
  });

  it('drops the oldest of 49 distinct hours', () => {
    const metrics = createRequestMetrics();
    for (let hour = 49; hour >= 1; hour -= 1) metrics.record({ atMs: hour * HOUR_MS, durationMs: 1, bytes: 1, failed: false });
    const hours = metrics.buckets().map((bucket) => bucket.hourStartMs);
    expect(hours).toHaveLength(48);
    expect(hours).not.toContain(HOUR_MS);
    expect(hours[0]).toBe(2 * HOUR_MS);
  });

  it('counts a request whose bytes are NaN or negative but adds no bytes', () => {
    const metrics = createRequestMetrics();
    metrics.record({ atMs: HOUR_MS, durationMs: 4, bytes: Number.NaN, failed: false });
    metrics.record({ atMs: HOUR_MS, durationMs: 6, bytes: -5, failed: false });
    expect(metrics.buckets()).toEqual([bucketAt(HOUR_MS, { requests: 2, durationTotalMs: 10, durationCount: 2 })]);
  });

  it('counts a request with a negative duration but adds no duration', () => {
    const metrics = createRequestMetrics();
    metrics.record({ atMs: HOUR_MS, durationMs: -50, bytes: 0, failed: false });
    expect(metrics.buckets()).toEqual([bucketAt(HOUR_MS, { requests: 1, durationCount: 1 })]);
  });

  it('ignores a non-finite server load without emitting', () => {
    const metrics = createRequestMetrics({ now: () => HOUR_MS });
    const emissions = track(metrics);
    metrics.recordServerLoad(Number.NaN);
    expect(metrics.buckets()).toEqual([]);
    expect(emissions).toEqual([[]]);
  });

  it('keeps the last and the highest server load of an hour', () => {
    const metrics = createRequestMetrics({ now: () => HOUR_MS + 1 });
    metrics.recordServerLoad(2);
    metrics.recordServerLoad(0.5);
    expect(metrics.buckets()).toEqual([bucketAt(HOUR_MS, { loadLast: 0.5, loadMax: 2 })]);
  });

  it('emits the buckets now and after every change, as copies', () => {
    const metrics = createRequestMetrics();
    const emissions = track(metrics);
    metrics.record({ atMs: HOUR_MS, durationMs: 1, bytes: 1, failed: false });
    expect(emissions).toEqual([[], [bucketAt(HOUR_MS, { requests: 1, bytes: 1, durationTotalMs: 1, durationCount: 1 })]]);
    const [copy] = metrics.buckets();
    if (copy) copy.requests = 99;
    expect(metrics.buckets()[0]?.requests).toBe(1);
  });
});

describe('hydrate', () => {
  it('skips invalid entries and non-arrays without emitting', () => {
    const metrics = createRequestMetrics();
    const emissions = track(metrics);
    const { bytes: _bytes, ...missingBytes } = bucketAt(HOUR_MS);
    metrics.hydrate([missingBytes, bucketAt(HOUR_MS, { requests: Number.POSITIVE_INFINITY }),
      bucketAt(HOUR_MS, { loadMax: Number.NaN }), null, 'x']);
    metrics.hydrate({ hourStartMs: HOUR_MS });
    metrics.hydrate(undefined);
    expect(metrics.buckets()).toEqual([]);
    expect(emissions).toHaveLength(1);
    expect(isRequestMetricsBucket(bucketAt(HOUR_MS))).toBe(true);
    expect(isRequestMetricsBucket(missingBytes)).toBe(false);
  });

  it('folds a persisted bucket into its live hour', () => {
    const metrics = createRequestMetrics({ now: () => HOUR_MS });
    metrics.record({ atMs: HOUR_MS, durationMs: 10, bytes: 5, failed: true });
    metrics.recordServerLoad(1);
    metrics.hydrate([bucketAt(HOUR_MS, {
      requests: 2, bytes: 7, durationTotalMs: 30, durationCount: 2, errors: 1, loadLast: 3, loadMax: 4,
    })]);
    expect(metrics.buckets()).toEqual([bucketAt(HOUR_MS, {
      requests: 3, bytes: 12, durationTotalMs: 40, durationCount: 3, errors: 2, loadLast: 1, loadMax: 4,
    })]);
  });

  it('takes the persisted server load when the live hour has none', () => {
    const metrics = createRequestMetrics();
    metrics.record({ atMs: HOUR_MS, durationMs: 1, bytes: 0, failed: false });
    metrics.hydrate([bucketAt(HOUR_MS, { loadLast: 0.7, loadMax: 0.8 })]);
    expect(metrics.buckets()[0]).toMatchObject({ loadLast: 0.7, loadMax: 0.8 });
  });

  it('keeps a higher live server load over a lower persisted one', () => {
    const metrics = createRequestMetrics({ now: () => HOUR_MS });
    metrics.recordServerLoad(3);
    metrics.hydrate([bucketAt(HOUR_MS, { loadLast: 1, loadMax: 1 })]);
    expect(metrics.buckets()[0]).toMatchObject({ loadLast: 3, loadMax: 3 });
  });
});

function fakeFetch(outcome: Response | Error | DOMException): typeof globalThis.fetch {
  return () => (outcome instanceof Response ? Promise.resolve(outcome) : Promise.reject(outcome));
}

describe('meteredFetch', () => {
  it('records a 200 and returns the same unread response', async () => {
    const metrics = createRequestMetrics();
    const response = new Response('hello', { status: 200, headers: { 'content-length': '120' } });
    const returned = await meteredFetch(fakeFetch(response), metrics, { now: () => HOUR_MS })('https://s.test/a');
    expect(returned).toBe(response);
    expect(await returned.text()).toBe('hello');
    expect(metrics.buckets()).toEqual([bucketAt(HOUR_MS, { requests: 1, bytes: 120, durationCount: 1 })]);
  });

  it.each([
    [500, 1], [304, 0], [404, 1],
  ])('counts a %s as %s errors', async (status, errors) => {
    const metrics = createRequestMetrics();
    await meteredFetch(fakeFetch(new Response(null, { status })), metrics)('https://s.test/a');
    expect(metrics.buckets()[0]).toMatchObject({ requests: 1, bytes: 0, errors });
  });

  it('takes a custom failure test', async () => {
    const metrics = createRequestMetrics();
    await meteredFetch(fakeFetch(new Response(null, { status: 500 })), metrics, { isFailure: () => false })('https://s.test/a');
    expect(metrics.buckets()[0]).toMatchObject({ requests: 1, errors: 0 });
  });

  it('records a network failure and rethrows it', async () => {
    const metrics = createRequestMetrics();
    const error = new TypeError('Failed to fetch');
    await expect(meteredFetch(fakeFetch(error), metrics)('https://s.test/a')).rejects.toBe(error);
    expect(metrics.buckets()[0]).toMatchObject({ requests: 1, bytes: 0, errors: 1 });
  });

  it('records a rejection at its start, with the time it took', async () => {
    const metrics = createRequestMetrics();
    const times = [2 * HOUR_MS - 10, 2 * HOUR_MS + 30];
    const now = () => times.shift() ?? Number.NaN;
    const error = new TypeError('Failed to fetch');
    await expect(meteredFetch(fakeFetch(error), metrics, { now })('https://s.test/a')).rejects.toBe(error);
    expect(metrics.buckets()).toEqual([bucketAt(HOUR_MS, { requests: 1, durationTotalMs: 40, durationCount: 1, errors: 1 })]);
  });

  it('records an abort as a request, not a failure, and rethrows it', async () => {
    const metrics = createRequestMetrics();
    const error = new DOMException('The operation was aborted.', 'AbortError');
    await expect(meteredFetch(fakeFetch(error), metrics)('https://s.test/a')).rejects.toBe(error);
    expect(metrics.buckets()[0]).toMatchObject({ requests: 1, errors: 0 });
  });

  it('treats any rejection after our own abort signal as an abort', async () => {
    const metrics = createRequestMetrics();
    const controller = new AbortController();
    controller.abort();
    const error = new Error('Fetch request has been canceled');
    await expect(meteredFetch(fakeFetch(error), metrics)('https://s.test/a', { signal: controller.signal })).rejects.toBe(error);
    expect(metrics.buckets()[0]).toMatchObject({ requests: 1, errors: 0 });
  });

  it.each([
    ['[1.5,1.2,0.9]', 1.5], ['oops', undefined], ['[]', undefined],
  ])('reads server load %s as %s', async (header, load) => {
    const metrics = createRequestMetrics();
    const response = new Response(null, { status: 200, headers: { 'X-Server-Load': header } });
    await meteredFetch(fakeFetch(response), metrics, { serverLoadHeader: 'X-Server-Load', now: () => HOUR_MS })('https://s.test/a');
    expect(metrics.buckets()[0]?.loadLast).toBe(load);
    expect(metrics.buckets()[0]?.loadMax).toBe(load);
  });

  it('ignores the server-load header unless asked to read it', async () => {
    const metrics = createRequestMetrics();
    const response = new Response(null, { status: 200, headers: { 'X-Server-Load': '[1.5]' } });
    await meteredFetch(fakeFetch(response), metrics)('https://s.test/a');
    expect(metrics.buckets()[0]?.loadLast).toBeUndefined();
  });

  it('measures the duration from start to settle with the injected clock', async () => {
    const metrics = createRequestMetrics();
    const times = [HOUR_MS + 100, HOUR_MS + 340];
    const now = () => times.shift() ?? Number.NaN;
    await meteredFetch(fakeFetch(new Response(null, { status: 200 })), metrics, { now })('https://s.test/a');
    expect(metrics.buckets()).toEqual([bucketAt(HOUR_MS, { requests: 1, durationTotalMs: 240, durationCount: 1 })]);
  });
});

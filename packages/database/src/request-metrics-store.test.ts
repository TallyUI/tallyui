import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';

import * as entry from './index';
import { createRequestMetrics, REQUEST_METRICS_HOUR_MS, type RequestMetrics } from './request-metrics';
import {
  addRequestMetricsCollection, persistRequestMetrics, REQUEST_METRICS_COLLECTION, REQUEST_METRICS_PERSIST_INTERVAL_MS,
  type RequestMetricsCollection, type RequestMetricsDoc, type RequestMetricsPersistence,
} from './request-metrics-store';

addRxPlugin(RxDBDevModePlugin);

const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
const H = REQUEST_METRICS_HOUR_MS;
const T = Date.UTC(2026, 10, 11, 9);
const row = (hourStartMs: number, requests = 1): RequestMetricsDoc => ({
  hour: String(hourStartMs), hourStartMs, requests, bytes: 10 * requests, durationTotalMs: 100 * requests,
  durationCount: requests, errors: 0,
});
const attempt = (metrics: RequestMetrics, atMs = T + 1_000, failed = false) =>
  metrics.record({ atMs, durationMs: 100, bytes: 10, failed });

describe('request metrics store', () => {
  let db: RxDatabase;
  let c: RequestMetricsCollection;
  let opened: RequestMetricsPersistence[];
  const open = (metrics: RequestMetrics, options?: { everyMs?: number }) => {
    const persistence = persistRequestMetrics(metrics, c, options);
    opened.push(persistence);
    return persistence;
  };
  const stored = async (hourStartMs = T) => (await c.findOne(String(hourStartMs)).exec())?.toJSON();
  const rowCount = async () => (await c.find().exec()).length;

  beforeEach(async () => {
    db = await createRxDatabase({ name: `metrics_${Math.random().toString(36).slice(2)}`, storage, multiInstance: false });
    c = await addRequestMetricsCollection(db);
    opened = [];
  });

  afterEach(async () => {
    await Promise.allSettled(opened.map((persistence) => persistence.stop()));
    vi.useRealTimers();
    vi.restoreAllMocks();
    await db.remove();
  });

  it('adds the collection as request_metrics at version 0, keyed on hour', () => {
    expect(REQUEST_METRICS_COLLECTION).toBe('request_metrics');
    expect(REQUEST_METRICS_PERSIST_INTERVAL_MS).toBe(5 * 60 * 1000);
    expect(db.collections.request_metrics).toBe(c);
    expect(c.schema.version).toBe(0);
    expect(c.schema.primaryPath).toBe('hour');
  });

  it('inserts a valid bucket and rejects a negative, a fractional, an extra and a missing field', async () => {
    await expect(c.insert({ ...row(T), loadLast: 0.5, loadMax: 1 })).resolves.toBeDefined();
    await expect(c.insert({ ...row(T + H), requests: -1 })).rejects.toThrow();
    await expect(c.insert({ ...row(T + H), errors: 0.5 })).rejects.toThrow();
    await expect(c.insert({ ...row(T + H), extra: 1 } as never)).rejects.toThrow();
    const { durationCount: _durationCount, ...missing } = row(T + H);
    await expect(c.insert(missing as never)).rejects.toThrow();
    expect(await rowCount()).toBe(1);
  });

  it('round-trips an hour through the collection into a new counter', async () => {
    const metrics = createRequestMetrics();
    attempt(metrics);
    attempt(metrics);
    attempt(metrics, T + 2_000, true);
    const persistence = open(metrics);
    await persistence.ready;
    await persistence.flush();

    expect(await rowCount()).toBe(1);
    expect(await stored()).toStrictEqual({
      hour: String(T), hourStartMs: T, requests: 3, bytes: 30, durationTotalMs: 300, durationCount: 3, errors: 1,
    });

    const restarted = createRequestMetrics();
    await open(restarted).ready;
    expect(restarted.buckets()).toEqual(metrics.buckets());
  });

  it('folds a restart within the hour into one total and writes it over the stored row', async () => {
    await c.insert(row(T, 3));
    const metrics = createRequestMetrics();
    attempt(metrics);
    attempt(metrics);
    const persistence = open(metrics);
    await persistence.ready;
    expect(metrics.buckets()[0].requests).toBe(5);

    await persistence.flush();
    expect((await stored())?.requests).toBe(5);
  });

  it('writes only the hours that changed since the last write', async () => {
    const metrics = createRequestMetrics();
    attempt(metrics);
    const persistence = open(metrics);
    await persistence.flush();
    const upsert = vi.spyOn(c, 'bulkUpsert');
    await persistence.flush();
    expect(upsert).not.toHaveBeenCalled();

    attempt(metrics, T + 2 * H);
    await persistence.flush();
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].map((doc) => doc.hour)).toEqual([String(T + 2 * H)]);
  });

  it('deletes the oldest row once a 49th hour pushes it out of the newest 48', async () => {
    const hours = Array.from({ length: 48 }, (_, i) => T - (47 - i) * H);
    await c.bulkInsert(hours.map((hourStartMs) => row(hourStartMs)));
    const metrics = createRequestMetrics();
    const persistence = open(metrics);
    await persistence.ready;
    attempt(metrics, T + H + 1_000);
    await persistence.flush();

    expect(await rowCount()).toBe(48);
    expect(await stored(hours[0])).toBeUndefined();
    expect(await stored(hours[1])).toBeDefined();
    expect(await stored(T + H)).toBeDefined();
  });

  it('deletes nothing while the counter holds 47 hours', async () => {
    await c.bulkInsert(Array.from({ length: 47 }, (_, i) => row(T - i * H)));
    const metrics = createRequestMetrics();
    const persistence = open(metrics);
    await persistence.ready;
    expect(metrics.buckets()).toHaveLength(47);
    await c.insert(row(T - 100 * H));
    await persistence.flush();

    expect(await rowCount()).toBe(48);
    expect(await stored(T - 100 * H)).toBeDefined();
  });

  it('rewrites none of the rows it read at start', async () => {
    await c.bulkInsert([row(T - H), row(T, 2)]);
    const persistence = open(createRequestMetrics());
    await persistence.ready;
    const upsert = vi.spyOn(c, 'bulkUpsert');
    await persistence.flush();
    expect(upsert.mock.calls.flatMap(([docs]) => docs)).toEqual([]);
  });

  it('rejects a flush when an hour is not written', async () => {
    const metrics = createRequestMetrics();
    attempt(metrics);
    const persistence = open(metrics);
    await persistence.ready;
    vi.spyOn(c, 'bulkUpsert').mockResolvedValueOnce({ success: [], error: [{ status: 422 } as never] });
    await expect(persistence.flush()).rejects.toThrow('1 hour(s) not written');
  });

  it('runs a second flush only after the first one has written', async () => {
    const metrics = createRequestMetrics();
    attempt(metrics);
    const persistence = open(metrics);
    await persistence.ready;
    const bulkUpsert = c.bulkUpsert.bind(c);
    let openGate = () => {};
    const gate = new Promise<void>((resolve) => { openGate = resolve; });
    const upsert = vi.spyOn(c, 'bulkUpsert').mockImplementationOnce(async (docs) => {
      await gate;
      return bulkUpsert(docs);
    });

    const first = persistence.flush();
    await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    attempt(metrics, T + H + 1_000);
    const second = persistence.flush();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(upsert).toHaveBeenCalledTimes(1);

    openGate();
    await Promise.all([first, second]);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[1][0].map((doc) => doc.hour)).toEqual([String(T + H)]);
  });

  it('runs the next flush after one that failed', async () => {
    const metrics = createRequestMetrics();
    attempt(metrics);
    const persistence = open(metrics);
    await persistence.ready;
    const failure = new Error('write failed');
    vi.spyOn(c, 'bulkUpsert').mockRejectedValueOnce(failure);
    await expect(persistence.flush()).rejects.toBe(failure);

    attempt(metrics);
    await expect(persistence.flush()).resolves.toBeUndefined();
    expect((await stored())?.requests).toBe(2);
  });

  it('writes on the timer after REQUEST_METRICS_PERSIST_INTERVAL_MS without a manual flush', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const metrics = createRequestMetrics();
    const persistence = open(metrics);
    await persistence.ready;
    attempt(metrics);
    const bulkUpsert = c.bulkUpsert.bind(c);
    const wrote = new Promise<void>((resolve) => {
      vi.spyOn(c, 'bulkUpsert').mockImplementation(async (docs) => {
        const result = await bulkUpsert(docs);
        resolve();
        return result;
      });
    });

    vi.advanceTimersByTime(REQUEST_METRICS_PERSIST_INTERVAL_MS);
    await wrote;
    expect((await stored())?.requests).toBe(1);
  });

  it('writes the last change on stop, then writes nothing more, and a second stop resolves', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const metrics = createRequestMetrics();
    attempt(metrics);
    const persistence = open(metrics);
    const stopped = persistence.stop();
    await stopped;
    expect((await stored())?.requests).toBe(1);

    const upsert = vi.spyOn(c, 'bulkUpsert');
    attempt(metrics);
    vi.advanceTimersByTime(3 * REQUEST_METRICS_PERSIST_INTERVAL_MS);
    await persistence.flush();
    expect(upsert).not.toHaveBeenCalled();
    expect((await stored())?.requests).toBe(1);

    expect(persistence.stop()).toBe(stopped);
    await expect(persistence.stop()).resolves.toBeUndefined();
  });

  it('clears the timer on stop, so a later tick writes nothing', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const metrics = createRequestMetrics();
    attempt(metrics);
    const persistence = open(metrics);
    await persistence.stop();
    attempt(metrics);
    vi.advanceTimersByTime(REQUEST_METRICS_PERSIST_INTERVAL_MS);
    // Only setInterval is faked: a real timeout lets a stray timed flush settle before the check.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((await stored())?.requests).toBe(1);
  });

  it('stores loadLast and loadMax only for an hour with a load reading', async () => {
    const metrics = createRequestMetrics();
    attempt(metrics);
    attempt(metrics, T + H + 1_000);
    metrics.recordServerLoad(1.5, T + H + 2_000);
    metrics.recordServerLoad(0.75, T + H + 3_000);
    await open(metrics).flush();

    const quiet = await stored(T);
    expect(quiet).not.toHaveProperty('loadLast');
    expect(quiet).not.toHaveProperty('loadMax');
    expect(await stored(T + H)).toMatchObject({ loadLast: 0.75, loadMax: 1.5 });
  });

  it('rejects ready and writes nothing when the read rejects', async () => {
    const failure = new Error('read failed');
    vi.spyOn(c, 'find').mockReturnValueOnce({ exec: () => Promise.reject(failure) } as never);
    const upsert = vi.spyOn(c, 'bulkUpsert');
    const metrics = createRequestMetrics();
    attempt(metrics);
    const persistence = open(metrics);

    await expect(persistence.ready).rejects.toBe(failure);
    await expect(persistence.flush()).rejects.toBe(failure);
    expect(upsert).not.toHaveBeenCalled();
    expect(await rowCount()).toBe(0);
  });

  it('exports every value from the package entry', () => {
    const names = [
      'REQUEST_METRICS_COLLECTION', 'REQUEST_METRICS_PERSIST_INTERVAL_MS', 'requestMetricsSchema',
      'requestMetricsCollection', 'addRequestMetricsCollection', 'persistRequestMetrics',
    ];
    for (const name of names) expect(entry, name).toHaveProperty([name]);
  });
});

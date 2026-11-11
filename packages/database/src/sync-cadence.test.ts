import { describe, expect, it } from 'vitest';

import {
  clampSyncCadence, DEFAULT_SYNC_CADENCE_PRESET, isSyncCadencePreset, requestsPerHour, SYNC_CADENCE_PRESETS,
  syncCadencePresetBudget, syncCadencePresetFor,
} from './sync-cadence';

describe('sync cadence presets', () => {
  it('has the v2 numbers and defaults to balanced', () => {
    expect(SYNC_CADENCE_PRESETS).toEqual({
      eco: { checkIntervalMs: 300_000, pullBatchSize: 25 },
      balanced: { checkIntervalMs: 60_000, pullBatchSize: 50 },
      realtime: { checkIntervalMs: 10_000, pullBatchSize: 75 },
    });
    expect(DEFAULT_SYNC_CADENCE_PRESET).toBe('balanced');
  });

  // Ported from v2: the guard rail for re-tuning the numbers.
  it('moves both budget lines across the tiers and never ships a max-weight page', () => {
    const tiers = [SYNC_CADENCE_PRESETS.eco, SYNC_CADENCE_PRESETS.balanced, SYNC_CADENCE_PRESETS.realtime];
    const intervals = tiers.map((tier) => tier.checkIntervalMs);
    const sizes = tiers.map((tier) => tier.pullBatchSize);
    expect(intervals).toEqual([...intervals].sort((a, b) => b - a));
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(new Set(intervals).size).toBe(3);
    expect(new Set(sizes).size).toBe(3);
    expect(Math.max(...sizes)).toBeLessThan(100);
  });

  it('estimates requests per hour from the check interval', () => {
    expect(requestsPerHour(60_000)).toBe(60);
    expect(requestsPerHour(10_000)).toBe(360);
    expect(requestsPerHour(300_000)).toBe(12);
    expect(requestsPerHour(7_000)).toBe(514);
  });

  it('matches presets exactly and reports custom otherwise', () => {
    expect(syncCadencePresetFor({ checkIntervalMs: 300_000, pullBatchSize: 25 })).toBe('eco');
    expect(syncCadencePresetFor({ checkIntervalMs: 60_000, pullBatchSize: 50 })).toBe('balanced');
    expect(syncCadencePresetFor({ checkIntervalMs: 10_000, pullBatchSize: 75 })).toBe('realtime');
    expect(syncCadencePresetFor({ checkIntervalMs: 60_000, pullBatchSize: 51 })).toBe('custom');
    expect(syncCadencePresetFor({ checkIntervalMs: 59_999, pullBatchSize: 50 })).toBe('custom');
    expect(syncCadencePresetFor({ checkIntervalMs: 10_000, pullBatchSize: 25 })).toBe('custom');
    expect(syncCadencePresetFor({ checkIntervalMs: 45_000, pullBatchSize: 50 })).toBe('custom');
    expect(syncCadencePresetFor({ checkIntervalMs: 10_000, pullBatchSize: 50 })).toBe('custom');
  });

  it('clamps to the limits, truncates, and fills a missing field from balanced', () => {
    expect(clampSyncCadence({ checkIntervalMs: 1_000, pullBatchSize: 5 })).toEqual({ checkIntervalMs: 5_000, pullBatchSize: 10 });
    expect(clampSyncCadence({ checkIntervalMs: 999_999, pullBatchSize: 500 }))
      .toEqual({ checkIntervalMs: 300_000, pullBatchSize: 100 });
    expect(clampSyncCadence({ checkIntervalMs: 12_345.9, pullBatchSize: 33.7 }))
      .toEqual({ checkIntervalMs: 12_345, pullBatchSize: 33 });
    expect(clampSyncCadence({})).toEqual({ checkIntervalMs: 60_000, pullBatchSize: 50 });
  });

  it('throws TypeError on a non-finite number in either field', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => clampSyncCadence({ checkIntervalMs: bad, pullBatchSize: 50 })).toThrow(TypeError);
      expect(() => clampSyncCadence({ checkIntervalMs: 60_000, pullBatchSize: bad })).toThrow(TypeError);
    }
  });

  it('derives each preset budget from the table', () => {
    expect(syncCadencePresetBudget('eco')).toEqual({ intervalSeconds: 300, records: 25 });
    expect(syncCadencePresetBudget('balanced')).toEqual({ intervalSeconds: 60, records: 50 });
    expect(syncCadencePresetBudget('realtime')).toEqual({ intervalSeconds: 10, records: 75 });
  });

  it('recognises only the three preset names', () => {
    expect(['eco', 'balanced', 'realtime'].every(isSyncCadencePreset)).toBe(true);
    expect(isSyncCadencePreset('custom')).toBe(false);
    expect(isSyncCadencePreset('fast')).toBe(false);
    expect(isSyncCadencePreset('toString')).toBe(false);
    expect(isSyncCadencePreset(undefined)).toBe(false);
  });
});

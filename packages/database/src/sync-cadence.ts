// Ported from WCPOS v2 apps/main/components/health/performance-logic.ts (monorepo 85ecbd43f).

/** How often the till checks the store for changes, and how many records each check's page may carry. */
export interface SyncCadence { checkIntervalMs: number; pullBatchSize: number }

/**
 * The presets, macros over the two dials.
 *
 * Two independent budget lines: `checkIntervalMs` prices how often we ask, `pullBatchSize` how heavy each request
 * is. Page weight is what hurts shared hosting, and the check interval only multiplies it, so each tier moves both
 * lines, and no preset ships the 100-record maximum: that stays reachable only through Custom.
 *
 *   Eco       5 min · 25   —  12 checks/hour, lightest page
 *   Balanced   60 s · 50   —  60 checks/hour
 *   Realtime   10 s · 75   — 360 checks/hour, fast but not max-weight pages
 *
 * The numbers are in one table so they are easy to re-tune.
 */
export const SYNC_CADENCE_PRESETS = {
  eco: { checkIntervalMs: 300_000, pullBatchSize: 25 },
  balanced: { checkIntervalMs: 60_000, pullBatchSize: 50 },
  realtime: { checkIntervalMs: 10_000, pullBatchSize: 75 },
} as const;

export type SyncCadencePreset = keyof typeof SYNC_CADENCE_PRESETS;
export type SyncCadenceChoice = SyncCadencePreset | 'custom';

/** The shipped default: what a fresh till gets, and what "Reset" restores. */
export const DEFAULT_SYNC_CADENCE_PRESET: SyncCadencePreset = 'balanced';

/** v2 cadence-controller.ts reconfigure's clamp bounds. */
export const SYNC_CADENCE_LIMITS = {
  checkIntervalMs: { min: 5000, max: 300000 },
  pullBatchSize: { min: 10, max: 100 },
} as const;

export function isSyncCadencePreset(value: unknown): value is SyncCadencePreset {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SYNC_CADENCE_PRESETS, value);
}

function clampField(name: keyof SyncCadence, value: number | undefined): number {
  const raw = value ?? SYNC_CADENCE_PRESETS[DEFAULT_SYNC_CADENCE_PRESET][name];
  if (!Number.isFinite(raw)) throw new TypeError(`${name} must be a finite number`);
  const { min, max } = SYNC_CADENCE_LIMITS[name];
  return Math.min(max, Math.max(min, Math.trunc(raw)));
}

/**
 * Math.trunc, then clamp to SYNC_CADENCE_LIMITS. A missing field takes Balanced's number. Throws TypeError on a
 * non-finite number, as v2's reconfigure does.
 */
export function clampSyncCadence(value: Partial<SyncCadence>): SyncCadence {
  return {
    checkIntervalMs: clampField('checkIntervalMs', value.checkIntervalMs),
    pullBatchSize: clampField('pullBatchSize', value.pullBatchSize),
  };
}

/** v2's presetFor: an exact match on both numbers gives the preset's name, anything else gives 'custom'. */
export function syncCadencePresetFor(value: SyncCadence): SyncCadenceChoice {
  for (const name of Object.keys(SYNC_CADENCE_PRESETS) as SyncCadencePreset[]) {
    const preset = SYNC_CADENCE_PRESETS[name];
    if (preset.checkIntervalMs === value.checkIntervalMs && preset.pullBatchSize === value.pullBatchSize) return name;
  }
  return 'custom';
}

/** Both budget lines in the preset's own numbers, derived so copy can never drift from the table. */
export function syncCadencePresetBudget(name: SyncCadencePreset): { intervalSeconds: number; records: number } {
  return {
    intervalSeconds: Math.round(SYNC_CADENCE_PRESETS[name].checkIntervalMs / 1000),
    records: SYNC_CADENCE_PRESETS[name].pullBatchSize,
  };
}

/** Checks per hour at this interval, rounded to a whole number. */
export function requestsPerHour(checkIntervalMs: number): number {
  return Math.round(3_600_000 / checkIntervalMs);
}

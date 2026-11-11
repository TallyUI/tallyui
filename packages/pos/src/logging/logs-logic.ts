/**
 * Pure helpers for a Logs screen, ported from WCPOS v2 `packages/core/src/screens/main/logs/logs-logic.ts`
 * (monorepo `main` 51e7c4351): `presetFilters` (its `has_actor` part) and `deriveStuckRecords`. v2 reads its
 * stored log rows; these read TallyUI's `LogEntry`, with its typed `actor` and `syncRecord`. v2's `sync` preset
 * filters on v2's `wcpos.sync` category, which TallyUI's log scopes have no counterpart for, so it is not ported.
 */
import type { LogEntry, LogLevel } from './types';

export type LogPreset = 'all' | 'actions' | 'errors';

export interface LogPresetFilters {
  level: LogLevel[];
  /** Only entries a person did (`hasActor`). */
  has_actor?: true;
}

/** Preset chip to filters. Debug entries count only while verbose diagnostics is on. */
export function presetFilters(preset: LogPreset, verbose: boolean): LogPresetFilters {
  const level: LogLevel[] = verbose ? ['debug', 'info', 'warn', 'error'] : ['info', 'warn', 'error'];
  switch (preset) {
    case 'all':
      return { level };
    case 'actions':
      return { level, has_actor: true };
    case 'errors':
      return { level: ['error'] };
  }
}

/** A person did it: the entry's actor names an id or a name (v2 reads such a row as an action). */
export function hasActor(entry: Pick<LogEntry, 'actor'>): boolean {
  return !!(entry.actor?.id || entry.actor?.name);
}

export function matchesPresetFilters(entry: LogEntry, filters: LogPresetFilters): boolean {
  return filters.level.includes(entry.level) && (!filters.has_actor || hasActor(entry));
}

export interface StuckRecord {
  /** `${collection}:${recordId}` */
  key: string;
  collection: string;
  recordId: string;
  /** `failed`: the store refused it. `pending`: the store keeps failing it, and it is still retrying. */
  outcome: 'failed' | 'pending';
  code?: string;
  reason: string;
  /** When its latest outcome was logged. */
  lastSeen: number;
}

/**
 * The records whose latest sync outcome is `failed` or `pending`; an `ok` clears. Entries without a `syncRecord`
 * are no evidence either way. The latest is by timestamp, and on equal timestamps the entry later in `entries`
 * (the order a sink receives them). Newest first.
 */
export function deriveStuckRecords(entries: readonly LogEntry[]): StuckRecord[] {
  const latest = new Map<string, LogEntry>();
  for (const entry of entries) {
    if (!entry.syncRecord) continue;
    const key = `${entry.syncRecord.collection}:${entry.syncRecord.recordId}`;
    const seen = latest.get(key);
    if (!seen || entry.timestamp >= seen.timestamp) latest.set(key, entry);
  }
  const stuck: StuckRecord[] = [];
  for (const [key, entry] of latest) {
    const { collection, recordId, outcome, code, reason } = entry.syncRecord!;
    if (outcome === 'ok') continue;
    stuck.push({ key, collection, recordId, outcome, ...(code ? { code } : {}), reason: reason || entry.message,
      lastSeen: entry.timestamp });
  }
  return stuck.sort((a, b) => b.lastSeen - a.lastSeen);
}

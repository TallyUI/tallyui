// Ported from WCPOS v2 `packages/core/src/screens/main/logs/logs-logic.test.ts` (monorepo `main` 51e7c4351):
// the `presetFilters` and `deriveStuckRecords` cases that fit TallyUI's log entries. v2's rows become `LogEntry`s
// with a typed `actor` and `syncRecord`; v2's `sync` preset (its `wcpos.sync` category), repeat-collapse
// attempts, pull-side escalations and `recovered`/`cancelled` outcomes have no TallyUI counterpart.
import { describe, expect, it } from 'vitest';
import { deriveStuckRecords, hasActor, matchesPresetFilters, presetFilters } from './logs-logic';
import type { LogEntry, LogSyncRecord } from './types';

const entry = (overrides: Partial<LogEntry>): LogEntry => ({
  level: 'info', scope: 'outbox', message: 'm', timestamp: 1_000, ...overrides,
});
const recordEntry = (timestamp: number, outcome: LogSyncRecord['outcome'], record: Partial<LogSyncRecord> = {}, message = 'm') =>
  entry({ timestamp, message, level: outcome === 'ok' ? 'info' : 'warn',
    syncRecord: { collection: 'pos_orders', recordId: '812', outcome, ...record } });

describe('presetFilters', () => {
  it('excludes debug unless verbose diagnostics is on', () => {
    expect(presetFilters('all', false)).toEqual({ level: ['info', 'warn', 'error'] });
    expect(presetFilters('all', true)).toEqual({ level: ['debug', 'info', 'warn', 'error'] });
  });

  it('narrows errors to error level only, matching the stat header count', () => {
    expect(presetFilters('errors', true)).toEqual({ level: ['error'] });
  });

  it('scopes actions to actor rows', () => {
    expect(presetFilters('actions', false)).toEqual({ level: ['info', 'warn', 'error'], has_actor: true });
    expect(presetFilters('actions', true)).toEqual({ level: ['debug', 'info', 'warn', 'error'], has_actor: true });
  });
});

describe('hasActor', () => {
  it('counts an actor that names an id or a name, as v2 reads an action', () => {
    expect(hasActor(entry({ actor: { id: '7' } }))).toBe(true);
    expect(hasActor(entry({ actor: { name: 'Pat' } }))).toBe(true);
    expect(hasActor(entry({ actor: { id: '', name: '' } }))).toBe(false);
    expect(hasActor(entry({ actor: { role: 'cashier' } }))).toBe(false);
    expect(hasActor(entry({}))).toBe(false);
  });
});

describe('matchesPresetFilters', () => {
  const action = entry({ actor: { id: '7', name: 'Pat' } });
  const system = entry({});
  const debugAction = entry({ level: 'debug', actor: { id: '7', name: 'Pat' } });
  const error = entry({ level: 'error' });

  it('keeps only the person-done entries for the actions preset', () => {
    const entries = [action, system, debugAction, error];
    expect(entries.filter((e) => matchesPresetFilters(e, presetFilters('actions', false)))).toEqual([action]);
    expect(entries.filter((e) => matchesPresetFilters(e, presetFilters('actions', true)))).toEqual([action, debugAction]);
  });

  it('filters by level for the other presets', () => {
    const entries = [action, system, debugAction, error];
    expect(entries.filter((e) => matchesPresetFilters(e, presetFilters('all', false)))).toEqual([action, system, error]);
    expect(entries.filter((e) => matchesPresetFilters(e, presetFilters('errors', false)))).toEqual([error]);
  });
});

describe('deriveStuckRecords', () => {
  // v2's money-divergence regression, in TallyUI's terms: an entry without a record outcome is no evidence.
  it('does not let an entry without a sync record overturn a successful write', () => {
    const entries = [
      recordEntry(300, 'ok'),
      entry({ timestamp: 400, level: 'error', message: 'server totals differ', data: { recordId: '812', collection: 'pos_orders' } }),
    ];
    expect(deriveStuckRecords(entries)).toEqual([]);
  });

  it('still reports a record whose transfer really did fail', () => {
    const entries = [recordEntry(300, 'ok'), recordEntry(400, 'failed', { code: 'rest_invalid_param' })];
    expect(deriveStuckRecords(entries).map((stuck) => stuck.recordId)).toEqual(['812']);
  });

  it('rules stuck from the latest decisive outcome per record', () => {
    const entries = [
      recordEntry(200, 'ok', { collection: 'products' }),
      recordEntry(250, 'ok', { collection: 'orders', recordId: '5' }),
      recordEntry(300, 'failed', { collection: 'products', reason: 'invalid tax class' }),
    ];
    const stuck = deriveStuckRecords(entries);
    expect(stuck).toHaveLength(1);
    expect(stuck[0]).toMatchObject({ collection: 'products', recordId: '812', reason: 'invalid tax class', outcome: 'failed' });
  });

  it('clears a record whose latest decisive row is ok', () => {
    expect(deriveStuckRecords([recordEntry(200, 'failed'), recordEntry(300, 'ok')])).toHaveLength(0);
  });

  it('re-marks a record stuck when a fresh failure lands after an ok', () => {
    expect(deriveStuckRecords([recordEntry(200, 'failed'), recordEntry(300, 'ok'), recordEntry(400, 'failed')])).toHaveLength(1);
  });

  it('counts a record still retrying alone as stuck, and keeps its outcome', () => {
    expect(deriveStuckRecords([recordEntry(300, 'pending', { reason: 'status_503' })])).toEqual([
      { key: 'pos_orders:812', collection: 'pos_orders', recordId: '812', outcome: 'pending', reason: 'status_503', lastSeen: 300 },
    ]);
  });

  it('falls back to the message for the reason, and carries the code', () => {
    const [stuck] = deriveStuckRecords([recordEntry(300, 'failed', { code: 'insufficient_stock' }, 'Order refused by the store')]);
    expect(stuck).toMatchObject({ reason: 'Order refused by the store', code: 'insufficient_stock' });
  });

  it('keys records by collection, so the same id in two collections is two records', () => {
    const entries = [recordEntry(300, 'failed', { collection: 'a' }), recordEntry(400, 'ok', { collection: 'b' })];
    expect(deriveStuckRecords(entries).map((stuck) => stuck.key)).toEqual(['a:812']);
  });

  it('reads a mixed log in any order: the latest outcome wins, and a record whose later push succeeded is no longer stuck', () => {
    const log = [
      recordEntry(100, 'failed', { recordId: 'a', code: 'insufficient_stock' }),
      entry({ timestamp: 150, actor: { id: '7', name: 'Pat' }, message: 'Register session opened' }),
      recordEntry(200, 'failed', { recordId: 'b' }),
      recordEntry(250, 'pending', { recordId: 'c', reason: 'status_503' }),
      recordEntry(300, 'ok', { recordId: 'a' }),
      recordEntry(350, 'ok', { recordId: 'd' }),
    ];
    for (const entries of [log, [...log].reverse()]) {
      expect(deriveStuckRecords(entries).map((stuck) => [stuck.recordId, stuck.outcome])).toEqual([['c', 'pending'], ['b', 'failed']]);
    }
  });

  it('on equal timestamps, the entry logged later rules', () => {
    expect(deriveStuckRecords([recordEntry(300, 'failed'), recordEntry(300, 'ok')])).toEqual([]);
    expect(deriveStuckRecords([recordEntry(300, 'ok'), recordEntry(300, 'failed')])).toHaveLength(1);
  });

  it('sorts newest first', () => {
    const entries = [recordEntry(100, 'failed', { recordId: '1' }), recordEntry(300, 'failed', { recordId: '2' })];
    expect(deriveStuckRecords(entries).map((stuck) => stuck.recordId)).toEqual(['2', '1']);
  });
});

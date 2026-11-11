import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { firstValueFrom, take, toArray } from 'rxjs';

import * as entry from './index';
import {
  addSyncCadenceCollection, readSyncCadence, resetSyncCadence, setSyncCadence, SYNC_CADENCE_COLLECTION,
  SYNC_CADENCE_DOC_ID, syncCadence$, type SyncCadenceCollection,
} from './sync-cadence-store';

addRxPlugin(RxDBDevModePlugin);

const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
const AT = '2026-01-01T00:00:00.000Z';
const BALANCED = { preset: 'balanced', checkIntervalMs: 60_000, pullBatchSize: 50 };
const ECO = { preset: 'eco', checkIntervalMs: 300_000, pullBatchSize: 25 };
const REALTIME = { preset: 'realtime', checkIntervalMs: 10_000, pullBatchSize: 75 };

describe('sync cadence store', () => {
  let db: RxDatabase;
  let c: SyncCadenceCollection;
  const stored = async () => (await c.findOne(SYNC_CADENCE_DOC_ID).exec())?.toJSON();

  beforeEach(async () => {
    db = await createRxDatabase({ name: `cadence_${Math.random().toString(36).slice(2)}`, storage, multiInstance: false });
    c = await addSyncCadenceCollection(db);
  });

  afterEach(async () => {
    await db.remove();
  });

  it('adds the collection as sync_cadence at version 0, keyed on id', () => {
    expect(SYNC_CADENCE_COLLECTION).toBe('sync_cadence');
    expect(db.collections.sync_cadence).toBe(c);
    expect(c.schema.version).toBe(0);
    expect(c.schema.primaryPath).toBe('id');
  });

  it('reads Balanced with no document, and syncCadence$ starts at Balanced', async () => {
    expect(await readSyncCadence(c)).toEqual(BALANCED);
    expect(await firstValueFrom(syncCadence$(c))).toEqual(BALANCED);
  });

  it('stores a preset by name with no number keys', async () => {
    const result = await setSyncCadence(c, 'eco', { now: () => Date.parse(AT) });
    expect(await stored()).toStrictEqual({ id: 'default', preset: 'eco', updatedAt: AT });
    expect(result).toEqual(ECO);
  });

  it('stores a custom value with both numbers and reads it back', async () => {
    await setSyncCadence(c, { checkIntervalMs: 20_000, pullBatchSize: 40 });
    expect(await stored()).toMatchObject({ preset: 'custom', checkIntervalMs: 20_000, pullBatchSize: 40 });
    expect(await readSyncCadence(c)).toEqual({ preset: 'custom', checkIntervalMs: 20_000, pullBatchSize: 40 });
  });

  it('stores a custom value equal to Realtime by name', async () => {
    await setSyncCadence(c, { checkIntervalMs: 10_000, pullBatchSize: 75 }, { now: () => Date.parse(AT) });
    expect(await stored()).toStrictEqual({ id: 'default', preset: 'realtime', updatedAt: AT });
    expect(await readSyncCadence(c)).toEqual(REALTIME);
  });

  it('clamps a custom value before storing it', async () => {
    const result = await setSyncCadence(c, { checkIntervalMs: 1_000, pullBatchSize: 500 });
    const custom = { preset: 'custom', checkIntervalMs: 5_000, pullBatchSize: 100 };
    expect(await stored()).toMatchObject(custom);
    expect(result).toEqual(custom);
  });

  it('resets a custom value to Balanced with no number keys', async () => {
    await setSyncCadence(c, { checkIntervalMs: 20_000, pullBatchSize: 40 });
    await resetSyncCadence(c, { now: () => Date.parse(AT) });
    expect(await stored()).toStrictEqual({ id: 'default', preset: 'balanced', updatedAt: AT });
    expect(await readSyncCadence(c)).toEqual(BALANCED);
  });

  it('ignores stored numbers on a named document', async () => {
    await c.insert({ id: 'default', preset: 'eco', checkIntervalMs: 20_000, pullBatchSize: 40, updatedAt: AT });
    expect(await readSyncCadence(c)).toEqual(ECO);
    expect(await firstValueFrom(syncCadence$(c))).toEqual(ECO);
  });

  it('emits on a change only, not on a repeat of the same profile', async () => {
    const emissions = firstValueFrom(syncCadence$(c).pipe(take(3), toArray()));
    expect(await firstValueFrom(syncCadence$(c))).toEqual(BALANCED);
    await setSyncCadence(c, 'eco');
    await setSyncCadence(c, 'eco');
    await setSyncCadence(c, 'realtime');
    expect(await emissions).toEqual([BALANCED, ECO, REALTIME]);
  });

  it('rejects an unknown preset, an out-of-range or fractional number and an extra property in the schema', async () => {
    await expect(c.insert({ id: 'default', preset: 'fast', updatedAt: AT } as never)).rejects.toThrow();
    await expect(c.insert({ id: 'default', preset: 'custom', checkIntervalMs: 1000, updatedAt: AT })).rejects.toThrow();
    await expect(c.insert({ id: 'default', preset: 'custom', checkIntervalMs: 12_345.5, pullBatchSize: 50, updatedAt: AT }))
      .rejects.toThrow();
    await expect(c.insert({ id: 'default', preset: 'custom', checkIntervalMs: 20_000, pullBatchSize: 33.5, updatedAt: AT }))
      .rejects.toThrow();
    await expect(c.insert({ id: 'default', preset: 'eco', updatedAt: AT, extra: 1 } as never)).rejects.toThrow();
    expect(await stored()).toBeUndefined();
  });

  it('throws TypeError on an unknown preset name and writes nothing', async () => {
    await expect(setSyncCadence(c, 'fast' as never)).rejects.toThrow(TypeError);
    expect(await stored()).toBeUndefined();
  });

  it('honours now for updatedAt', async () => {
    await setSyncCadence(c, 'eco', { now: () => Date.UTC(2026, 10, 11) });
    expect((await stored())?.updatedAt).toBe('2026-11-11T00:00:00.000Z');
  });

  it('exports every value from the package entry', () => {
    const names = [
      'SYNC_CADENCE_PRESETS', 'DEFAULT_SYNC_CADENCE_PRESET', 'SYNC_CADENCE_LIMITS', 'isSyncCadencePreset',
      'clampSyncCadence', 'syncCadencePresetFor', 'syncCadencePresetBudget', 'requestsPerHour',
      'SYNC_CADENCE_COLLECTION', 'SYNC_CADENCE_DOC_ID', 'syncCadenceSchema', 'syncCadenceCollection',
      'addSyncCadenceCollection', 'readSyncCadence', 'syncCadence$', 'setSyncCadence', 'resetSyncCadence',
    ];
    for (const name of names) expect(entry, name).toHaveProperty([name]);
  });
});

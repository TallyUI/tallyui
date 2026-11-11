import type { RxCollection, RxDatabase, RxJsonSchema } from 'rxdb';
import { distinctUntilChanged, map, type Observable } from 'rxjs';

import {
  clampSyncCadence, DEFAULT_SYNC_CADENCE_PRESET, isSyncCadencePreset, SYNC_CADENCE_LIMITS, SYNC_CADENCE_PRESETS,
  syncCadencePresetFor, type SyncCadence, type SyncCadenceChoice, type SyncCadencePreset,
} from './sync-cadence';

/** The chosen sync cadence of this device. The host adds the collection as `sync_cadence`, as with `printer_profiles`. */
export const SYNC_CADENCE_COLLECTION = 'sync_cadence';
/** One document per database: a TallyUI database belongs to one store session. */
export const SYNC_CADENCE_DOC_ID = 'default';

export interface SyncCadenceDoc {
  id: string;
  /** A named preset is stored by name; its numbers always come from SYNC_CADENCE_PRESETS. */
  preset: SyncCadenceChoice;
  /** Only when preset is 'custom'. */
  checkIntervalMs?: number;
  pullBatchSize?: number;
  /** ISO 8601 instant of the last set. */
  updatedAt: string;
}

// Local only: never replicated, never made with connectorCollection().
export const syncCadenceSchema: RxJsonSchema<SyncCadenceDoc> = {
  version: 0, primaryKey: 'id', type: 'object', additionalProperties: false,
  properties: {
    id: { type: 'string', maxLength: 64 },
    preset: { type: 'string', enum: ['eco', 'balanced', 'realtime', 'custom'] },
    checkIntervalMs: {
      type: 'integer', minimum: SYNC_CADENCE_LIMITS.checkIntervalMs.min, maximum: SYNC_CADENCE_LIMITS.checkIntervalMs.max,
    },
    pullBatchSize: {
      type: 'integer', minimum: SYNC_CADENCE_LIMITS.pullBatchSize.min, maximum: SYNC_CADENCE_LIMITS.pullBatchSize.max,
    },
    updatedAt: { type: 'string' },
  },
  required: ['id', 'preset', 'updatedAt'],
};

export function syncCadenceCollection(): { readonly schema: RxJsonSchema<SyncCadenceDoc> } {
  return { schema: syncCadenceSchema } as const;
}
export type SyncCadenceCollection = RxCollection<SyncCadenceDoc>;

export async function addSyncCadenceCollection(db: RxDatabase): Promise<SyncCadenceCollection> {
  const added = await db.addCollections({ [SYNC_CADENCE_COLLECTION]: syncCadenceCollection() });
  return added[SYNC_CADENCE_COLLECTION] as SyncCadenceCollection;
}

export interface SyncCadenceProfile extends SyncCadence { preset: SyncCadenceChoice }

function resolve(doc: Pick<SyncCadenceDoc, 'preset' | 'checkIntervalMs' | 'pullBatchSize'> | null): SyncCadenceProfile {
  if (!doc) return { preset: DEFAULT_SYNC_CADENCE_PRESET, ...SYNC_CADENCE_PRESETS[DEFAULT_SYNC_CADENCE_PRESET] };
  if (isSyncCadencePreset(doc.preset)) return { preset: doc.preset, ...SYNC_CADENCE_PRESETS[doc.preset] };
  const { checkIntervalMs, pullBatchSize } = doc;
  return { preset: 'custom', ...clampSyncCadence({ checkIntervalMs, pullBatchSize }) };
}

export async function readSyncCadence(collection: SyncCadenceCollection): Promise<SyncCadenceProfile> {
  return resolve(await collection.findOne(SYNC_CADENCE_DOC_ID).exec());
}

export function syncCadence$(collection: SyncCadenceCollection): Observable<SyncCadenceProfile> {
  return collection.findOne(SYNC_CADENCE_DOC_ID).$.pipe(
    map(resolve),
    distinctUntilChanged((a, b) =>
      a.preset === b.preset && a.checkIntervalMs === b.checkIntervalMs && a.pullBatchSize === b.pullBatchSize),
  );
}

export async function setSyncCadence(
  collection: SyncCadenceCollection, value: SyncCadencePreset | SyncCadence, options?: { now?: () => number },
): Promise<SyncCadenceProfile> {
  if (typeof value === 'string' && !isSyncCadencePreset(value)) {
    throw new TypeError(`unknown sync cadence preset: ${String(value)}`);
  }
  const updatedAt = new Date((options?.now ?? Date.now)()).toISOString();
  const clamped = typeof value === 'string' ? undefined : clampSyncCadence(value);
  const preset = clamped ? syncCadencePresetFor(clamped) : (value as SyncCadencePreset);
  const doc: SyncCadenceDoc = { id: SYNC_CADENCE_DOC_ID, preset, ...(preset === 'custom' ? clamped : {}), updatedAt };
  await collection.upsert(doc);
  return resolve(doc);
}

export function resetSyncCadence(
  collection: SyncCadenceCollection, options?: { now?: () => number },
): Promise<SyncCadenceProfile> {
  return setSyncCadence(collection, DEFAULT_SYNC_CADENCE_PRESET, options);
}

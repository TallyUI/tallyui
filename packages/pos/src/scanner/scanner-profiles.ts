/**
 * Scanners set up on this device. Local only, never replicated; the app adds the collection as
 * `scanner_profiles`. Ported from WCPOS v2 `packages/database/src/collections/schemas/scanner-profiles.ts`
 * (monorepo 85ecbd43f, version 0, device-local) and its helpers in `packages/query/src/store-local/scanner-profiles.ts`.
 * `deviceKey` (from `scannerDeviceKey()`) is the primary key and the only field anything matches on; every other
 * identity field is display data. v2's `connectionType` `default: 'keyboard'` is left out because the field is required.
 */
import type { RxCollection, RxDatabase, RxJsonSchema } from 'rxdb';
import { map, type Observable } from 'rxjs';
import { SCANNER_DEVICE_KEY_MAX_LENGTH, type ScannerConnectionType } from './device-identity';

export const SCANNER_PROFILES_COLLECTION = 'scanner_profiles';

export interface ScannerProfile {
  /** scannerDeviceKey(): "<connectionType>:<normalized identity>". The primary key: one profile per device. */
  deviceKey: string;
  /** User-assigned, e.g. "Front counter scanner"; the UI falls back to deviceName when blank. */
  name?: string;
  connectionType: ScannerConnectionType;
  /** As the platform reports it. Display only. */
  deviceName: string;
  /** USB vendor id where the platform reports one. Display only. */
  vendorId?: number;
  productId?: number;
  /** Bluetooth service UUID, lowercase. Display only. */
  serviceUuid?: string;
  /** bluetooth-le platform peripheral id. Display only. */
  peripheralId?: string;
  /** ISO 8601 instant the profile was registered. */
  createdAt?: string;
}

export const scannerProfileSchema: RxJsonSchema<ScannerProfile> = {
  title: 'Scanner profiles', version: 0, primaryKey: 'deviceKey', type: 'object', additionalProperties: false,
  properties: {
    deviceKey: { type: 'string', maxLength: SCANNER_DEVICE_KEY_MAX_LENGTH },
    name: { type: 'string' },
    connectionType: { type: 'string', enum: ['keyboard', 'usb-serial', 'bluetooth-spp', 'bluetooth-le', 'hid-pos'] },
    deviceName: { type: 'string' },
    vendorId: { type: 'integer' },
    productId: { type: 'integer' },
    serviceUuid: { type: 'string' },
    peripheralId: { type: 'string' },
    createdAt: { type: 'string' },
  },
  required: ['deviceKey', 'connectionType', 'deviceName'],
};

export function scannerProfileCollection(): { readonly schema: RxJsonSchema<ScannerProfile> } {
  return { schema: scannerProfileSchema } as const;
}

export type ScannerProfileCollection = RxCollection<ScannerProfile>;

export async function addScannerProfileCollection(db: RxDatabase): Promise<ScannerProfileCollection> {
  const added = await db.addCollections({ [SCANNER_PROFILES_COLLECTION]: scannerProfileCollection() });
  return added[SCANNER_PROFILES_COLLECTION] as ScannerProfileCollection;
}

function profilesQuery(collection: ScannerProfileCollection, types?: readonly ScannerConnectionType[]) {
  if (!types?.length) return collection.find();
  return collection.find({ selector: { connectionType: types.length === 1 ? types[0] : { $in: [...types] } } });
}

/** The profiles as JSON rows, filtered to `types` when non-empty, re-emitting on every change. */
export function scannerProfiles$(
  collection: ScannerProfileCollection, types?: readonly ScannerConnectionType[],
): Observable<ScannerProfile[]> {
  return profilesQuery(collection, types).$.pipe(map((docs) => docs.map((doc) => doc.toJSON())));
}

/** One-shot read with the same filter. */
export async function readScannerProfiles(
  collection: ScannerProfileCollection, types?: readonly ScannerConnectionType[],
): Promise<ScannerProfile[]> {
  const docs = await profilesQuery(collection, types).exec();
  return docs.map((doc) => doc.toJSON());
}

/** Upsert on deviceKey: saving an existing device's profile again replaces it (a rename), never adds a twin. */
export async function saveScannerProfile(collection: ScannerProfileCollection, profile: ScannerProfile): Promise<void> {
  await collection.upsert(profile);
}

/** true when this call removed the profile; false when it was absent or another removal won the race. */
export async function removeScannerProfile(collection: ScannerProfileCollection, deviceKey: string): Promise<boolean> {
  const doc = await collection.findOne(deviceKey).exec();
  if (!doc) return false;
  try {
    await doc.remove();
  } catch (error) {
    if (!(await collection.findOne(deviceKey).exec())) return false;
    throw error;
  }
  return true;
}

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { firstValueFrom, take, toArray } from 'rxjs';
import {
  addScannerProfileCollection as addFromEntry, saveScannerProfile as saveFromEntry, scannerProfileSchema as schemaFromEntry,
} from '../index';
import { uuidv7 } from '../pos-order';
import { scannerDeviceKey, type ScannerConnectionType } from './device-identity';
import {
  addScannerProfileCollection, readScannerProfiles, removeScannerProfile, saveScannerProfile, scannerProfileSchema,
  scannerProfiles$, SCANNER_PROFILES_COLLECTION, type ScannerProfile, type ScannerProfileCollection,
} from './scanner-profiles';

const keyboard: ScannerProfile = {
  deviceKey: 'keyboard:1234:5678:acme scanner', connectionType: 'keyboard', deviceName: 'ACME Scanner',
  name: 'Counter', vendorId: 1234, productId: 5678, createdAt: '2026-10-18T10:00:00.000Z',
};
const serial: ScannerProfile = { deviceKey: 'usb-serial:1234:5678', connectionType: 'usb-serial', deviceName: 'Serial scanner' };

const byKey = (rows: ScannerProfile[]) => [...rows].sort((a, b) => a.deviceKey.localeCompare(b.deviceKey));

describe('scanner profiles', () => {
  let db: RxDatabase;
  let collection: ScannerProfileCollection;

  beforeEach(async () => {
    db = await createRxDatabase({ name: `scanners${uuidv7().replaceAll('-', '')}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    collection = await addScannerProfileCollection(db);
  });

  afterEach(async () => {
    await db.remove();
  });

  it('adds the collection as scanner_profiles at schema version 0, keyed on deviceKey', () => {
    expect(keyboard.deviceKey).toBe(scannerDeviceKey({
      connectionType: 'keyboard', vendorId: 1234, productId: 5678, deviceName: 'ACME Scanner',
    }));
    expect(db.collections[SCANNER_PROFILES_COLLECTION]).toBe(collection);
    expect(SCANNER_PROFILES_COLLECTION).toBe('scanner_profiles');
    expect(collection.schema.version).toBe(0);
    expect(collection.schema.primaryPath).toBe('deviceKey');
  });

  it.each([
    [undefined, [keyboard, serial]],
    [[], [keyboard, serial]],
    [['keyboard'], [keyboard]],
    [['keyboard', 'usb-serial'], [keyboard, serial]],
  ] as [ScannerConnectionType[] | undefined, ScannerProfile[]][])('reads and observes the rows for types %j', async (types, expected) => {
    await saveScannerProfile(collection, keyboard);
    await saveScannerProfile(collection, serial);
    expect(byKey(await readScannerProfiles(collection, types))).toEqual(byKey(expected));
    expect(byKey(await firstValueFrom(scannerProfiles$(collection, types)))).toEqual(byKey(expected));
  });

  it('gives no rows for a type nothing has', async () => {
    await saveScannerProfile(collection, keyboard);
    await saveScannerProfile(collection, serial);
    expect(await readScannerProfiles(collection, ['hid-pos'])).toEqual([]);
    expect(await firstValueFrom(scannerProfiles$(collection, ['hid-pos']))).toEqual([]);
  });

  it('upserts on deviceKey: saving again renames the profile and never adds a twin', async () => {
    const emissions = firstValueFrom(scannerProfiles$(collection).pipe(take(3), toArray()));
    // The query's first result arrives asynchronously; without this await the save lands first and `[]` is never seen.
    await firstValueFrom(scannerProfiles$(collection));
    await saveScannerProfile(collection, keyboard);
    await saveScannerProfile(collection, { ...keyboard, name: 'Renamed' });
    expect(await collection.count().exec()).toBe(1);
    expect(await readScannerProfiles(collection)).toEqual([{ ...keyboard, name: 'Renamed' }]);
    expect(await emissions).toEqual([[], [keyboard], [{ ...keyboard, name: 'Renamed' }]]);
  });

  it('removes by deviceKey and returns false for an already removed or unknown key', async () => {
    await saveScannerProfile(collection, keyboard);
    await saveScannerProfile(collection, serial);
    expect(await removeScannerProfile(collection, keyboard.deviceKey)).toBe(true);
    expect(await removeScannerProfile(collection, keyboard.deviceKey)).toBe(false);
    expect(await removeScannerProfile(collection, 'unknown')).toBe(false);
    expect(await readScannerProfiles(collection)).toEqual([serial]);
  });

  it('accepts two overlapping removals of the same scanner, exactly one of which removes it', async () => {
    await saveScannerProfile(collection, keyboard);
    const results = await Promise.all([
      removeScannerProfile(collection, keyboard.deviceKey),
      removeScannerProfile(collection, keyboard.deviceKey),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await collection.findOne(keyboard.deviceKey).exec()).toBeNull();
  });

  it('does not swallow a storage failure while the scanner still exists', async () => {
    vi.spyOn(collection, 'findOne').mockReturnValue({
      exec: async () => ({ remove: async () => { throw new Error('storage failed'); } }),
    } as never);
    await expect(removeScannerProfile(collection, keyboard.deviceKey)).rejects.toThrow('storage failed');
  });

  it('rejects an unknown property, an unknown connection type, a missing deviceName and an over-long deviceKey', async () => {
    await expect(collection.insert({ ...serial, extra: 1 } as never)).rejects.toThrow();
    await expect(collection.insert({ ...serial, connectionType: 'serial' } as never)).rejects.toThrow();
    await expect(collection.insert({ deviceKey: 'usb-serial:1', connectionType: 'usb-serial' } as never)).rejects.toThrow();
    await expect(collection.insert({ ...serial, deviceKey: 'k'.repeat(129) })).rejects.toThrow();
    expect(await collection.find().exec()).toHaveLength(0);
  });

  it('is exported from the package entry', () => {
    expect(schemaFromEntry).toBe(scannerProfileSchema);
    expect(addFromEntry).toBe(addScannerProfileCollection);
    expect(saveFromEntry).toBe(saveScannerProfile);
  });
});

// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { uuidv7 } from '../pos-order';
import { createDeviceScannerStateCell, scannerProfileStore } from './device-scanner';
import { addScannerProfileCollection, type ScannerProfile } from './scanner-profiles';

describe('scannerProfileStore', () => {
  it('saves and reads a USB serial profile through a real collection with schema validation', async () => {
    const db = await createRxDatabase({ name: `scanners${uuidv7().replaceAll('-', '')}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    try {
      const store = scannerProfileStore(await addScannerProfileCollection(db));
      const profile: ScannerProfile = {
        deviceKey: 'usb-serial:1234:5678', name: '', connectionType: 'usb-serial', deviceName: '', vendorId: 1234,
        productId: 5678, createdAt: '2026-11-11T09:30:00.000Z',
      };
      await store.save(profile);
      expect(await store.read(['usb-serial'])).toEqual([profile]);
      expect(await store.read(['bluetooth-spp'])).toEqual([]);
    } finally {
      await db.remove();
    }
  });
});

describe('createDeviceScannerStateCell', () => {
  it('starts disconnected and notifies once per distinct change', () => {
    const cell = createDeviceScannerStateCell();
    const listener = vi.fn();
    const unsubscribe = cell.subscribe(listener);
    expect(cell.get()).toEqual({ connected: false, connectedDeviceKey: null });
    cell.set({ connected: false, connectedDeviceKey: null });
    expect(listener).not.toHaveBeenCalled();
    cell.set({ connected: true, connectedDeviceKey: 'usb-serial:1:2' });
    cell.set({ connected: true, connectedDeviceKey: 'usb-serial:1:2' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith({ connected: true, connectedDeviceKey: 'usb-serial:1:2' });
    cell.set({ connected: true, connectedDeviceKey: 'usb-serial:3:4' });
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    cell.set({ connected: false, connectedDeviceKey: null });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(cell.get()).toEqual({ connected: false, connectedDeviceKey: null });
  });
});

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { addPrinterProfileCollection as addFromEntry, printerProfileSchema as schemaFromEntry } from '../index';
import { uuidv7 } from '../pos-order';
import {
  addPrinterProfileCollection, printerProfileSchema, PRINTER_PROFILES_COLLECTION,
  type PrinterProfile, type PrinterProfileCollection,
} from './printer-profiles';

describe('printer profiles', () => {
  let db: RxDatabase;
  let collection: PrinterProfileCollection;

  beforeEach(async () => {
    db = await createRxDatabase({ name: `printers${uuidv7().replaceAll('-', '')}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    collection = await addPrinterProfileCollection(db);
  });

  afterEach(async () => {
    await db.remove();
  });

  it('adds the collection as printer_profiles at schema version 0', () => {
    expect(db.collections[PRINTER_PROFILES_COLLECTION]).toBe(collection);
    expect(PRINTER_PROFILES_COLLECTION).toBe('printer_profiles');
    expect(collection.schema.version).toBe(0);
  });

  it('creates, reads, updates and deletes a profile', async () => {
    const counter: PrinterProfile = { id: uuidv7(), name: 'Front counter', connectionType: 'network', vendor: 'epson',
      address: '192.168.1.40', port: 9100, language: 'esc-pos', columns: 48, autoCut: true, drawerConnector: 'pin2' };
    await collection.insert(counter);
    await collection.insert({ id: 'system', name: 'Print dialog', connectionType: 'system', isBuiltIn: true, isDefault: true });
    expect((await collection.findOne(counter.id).exec())?.toJSON()).toEqual(counter);
    expect(await collection.find({ selector: { connectionType: 'system' } }).exec()).toHaveLength(1);

    await (await collection.findOne(counter.id).exec())!.incrementalPatch({ name: 'Bar', autoOpenDrawer: true });
    expect((await collection.findOne(counter.id).exec())?.toJSON()).toMatchObject({ name: 'Bar', autoOpenDrawer: true });

    await (await collection.findOne(counter.id).exec())!.remove();
    expect(await collection.findOne(counter.id).exec()).toBeNull();
    expect((await collection.find().exec()).map((doc) => doc.id)).toEqual(['system']);
  });

  it('rejects an unknown property, an unknown connection type and a missing name', async () => {
    await expect(collection.insert({ id: 'a', name: 'A', connectionType: 'usb', extra: 1 } as never)).rejects.toThrow();
    await expect(collection.insert({ id: 'b', name: 'B', connectionType: 'cloud' } as never)).rejects.toThrow();
    await expect(collection.insert({ id: 'c', connectionType: 'usb' } as never)).rejects.toThrow();
    expect(await collection.find().exec()).toHaveLength(0);
  });

  it('is exported from the package entry', () => {
    expect(schemaFromEntry).toBe(printerProfileSchema);
    expect(addFromEntry).toBe(addPrinterProfileCollection);
  });
});

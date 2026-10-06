// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { tenderVoidSchema as fromEntry } from '../index';
import { uuidv7 } from '../pos-order';
import { tenderVoidCollection, tenderVoidSchema, type TenderVoid } from './tender-void';

describe('tenderVoidSchema', () => {
  let db: RxDatabase<{ tender_voids: RxCollection<TenderVoid> }>;
  let collection: RxCollection<TenderVoid>;
  let full: TenderVoid;

  beforeEach(async () => {
    db = await createRxDatabase({ name: `tendervoid${uuidv7().replaceAll('-', '')}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    ({ tender_voids: collection } = await db.addCollections({ tender_voids: tenderVoidCollection() }));
    full = {
      paymentId: uuidv7(),
      saleId: uuidv7(),
      type: 'void',
      method: 'cash',
      amountMinor: 1000,
      tenderedMinor: 2000,
      reference: 'terminal-reference',
      currency: 'EUR',
      reason: 'removed',
      deviceTime: '2026-10-06T10:00:00.000Z',
      deviceTz: 'Europe/Madrid',
      registerId: 'register-1',
      sessionId: 'session-1',
      cashierRef: '42',
    };
  });

  afterEach(async () => {
    await db.remove();
  });

  it('stores a full record and reads it back', async () => {
    await collection.insert(full);
    const doc = await collection.findOne(full.paymentId).exec();
    expect(doc).not.toBeNull();
    expect(doc!.toJSON()).toMatchObject(full);
  });

  it('stores a minimal record without the optional fields', async () => {
    const minimal: TenderVoid = {
      paymentId: uuidv7(),
      saleId: uuidv7(),
      type: 'void',
      method: 'external',
      amountMinor: 1000,
      currency: 'EUR',
      reason: 'cancelled',
      deviceTime: '2026-10-06T10:00:00.000Z',
      deviceTz: 'Europe/Madrid',
      registerId: '',
      cashierRef: '42',
    };
    const doc = await collection.insert(minimal);
    expect(doc.toJSON()).toMatchObject(minimal);
  });

  it('rejects an unknown property', async () => {
    await expect(collection.insert({ ...full, extra: 1 } as unknown as TenderVoid)).rejects.toThrow();
  });

  it('rejects a reason outside removed and cancelled', async () => {
    await expect(collection.insert({ ...full, reason: 'refunded' } as unknown as TenderVoid)).rejects.toThrow();
  });

  it('rejects a type other than void', async () => {
    await expect(collection.insert({ ...full, type: 'sale' } as unknown as TenderVoid)).rejects.toThrow();
  });

  it('stores a method outside today\'s payment-method kinds', async () => {
    await expect(collection.insert({ ...full, method: 'card_present' } as unknown as TenderVoid)).resolves.toBeDefined();
    expect((await collection.findOne(full.paymentId).exec())!.toJSON().method).toBe('card_present');
  });

  it('rejects a record without deviceTz', async () => {
    const invalid: Partial<TenderVoid> = { ...full };
    delete invalid.deviceTz;
    await expect(collection.insert(invalid as unknown as TenderVoid)).rejects.toThrow();
  });

  it('rejects a second insert of the same paymentId', async () => {
    await collection.insert(full);
    await expect(collection.insert(full)).rejects.toThrow();
  });

  it('is exported from the package entry', () => {
    expect(fromEntry).toBe(tenderVoidSchema);
  });
});

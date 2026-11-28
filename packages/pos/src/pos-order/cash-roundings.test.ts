// @vitest-environment node
// ADR-094: cash rounding is an order field. The finalize backstop (the cashRounding capability), the wire, pos_orders 21 and the server's shape check.
import { describe, expect, it } from 'vitest';
import { createRxDatabase, fillWithDefaultSettings, type RxCollectionCreator } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { ServerCapabilities } from '@tallyui/core';
import { payloadShapeErrors, precheckCommand } from '@tallyui/core/server';
import { createOrderBuilder } from '../order/order-builder';
import { deriveExpected, paymentLedgerRows } from '../register/expected';
import { toOrderCreateEnvelope } from './command';
import { finalizeOrder } from './finalize';
import { addPosOrderCollection } from './open';
import { addPosOrderCollectionTests, olderCollection } from './open.test-helper';
import type { PosOrder } from './types';
import { uuidv7 } from './uuidv7';

/** R1's sale at builder level: 3125, taken as one cash leg of 3130 with its +5 entry. */
function rounded() {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
  builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: 3125, currency: 'EUR' } });
  builder.addPayment({ method: 'cash', amountMinor: 3130, tenderedMinor: 3130, changeMinor: 0 }, { minor: 5 });
  return builder.getSnapshot();
}

const carries: ServerCapabilities = { orderCreate: 12, cashRounding: true };

it.each([{ orderCreate: 12 }, { orderCreate: 12, cashRounding: false }])('F1: finalize refuses a rounded sale for a store whose connector does not declare cashRounding (%j)', (capabilities) => {
  expect(() => finalizeOrder(rounded(), { capabilities })).toThrow(
    'finalize: cash rounding needs a store whose connector declares the cashRounding capability');
});

it('R8d: addCashRounding keeps one entry per leg, summed, and drops it when the sum is 0', () => {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
  builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: 3125, currency: 'EUR' } });
  const leg = builder.addPayment({ method: 'cash', amountMinor: 3128, tenderedMinor: 3128, changeMinor: 0 });
  builder.addCashRounding({ paymentId: leg, minor: 5 });
  builder.addCashRounding({ paymentId: leg, minor: -2 });
  expect(builder.getSnapshot().cashRoundings).toEqual([{ paymentId: leg, minor: 3 }]);
  builder.addCashRounding({ paymentId: leg, minor: -3 });
  expect(builder.getSnapshot()).not.toHaveProperty('cashRoundings');
});

it('R10b: the drawer expects the float plus the rounded due in cash (paymentLedgerRows into deriveExpected)', () => {
  const posOrder = finalizeOrder(rounded(), { capabilities: carries });
  const ledgerRowsBySession = paymentLedgerRows([{ ...posOrder, sessionId: 's1' }]);
  expect(deriveExpected({ session: { id: 's1', countedFloatMinor: 5000 }, movements: [], ledgerRowsBySession }).cash).toBe(5000 + 3130);
});

describe('F2: the wire', () => {
  it('a rounded sale carries its entries at its content version, 4 at cap 12, and passes a flagged server', () => {
    const posOrder = finalizeOrder(rounded(), { capabilities: carries });
    expect(posOrder).toMatchObject({ totalMinor: 3130, cashRoundings: [{ paymentId: posOrder.payments[0].id, minor: 5 }] });
    const envelope = toOrderCreateEnvelope(posOrder, 'device-1', 1, { maxVersion: 12 });
    // Figures with no fees are content 3, sent as 4 at a cap of 4 or more (#286); the entries do not raise the version.
    expect(envelope.version).toBe(4);
    expect(envelope.payload.cashRoundings).toEqual([{ paymentId: posOrder.payments[0].id, minor: 5 }]);
    // Below version 5 there are no fee lines: subtotal 3125 + tax 0 is not the total; totalMinor and display.totalMinor carry the +5.
    expect(envelope.payload).toMatchObject({ subtotalMinor: 3125, taxMinor: 0, totalMinor: 3130, display: { totalMinor: 3130 } });
    expect(envelope.payload.payments).toEqual([expect.objectContaining({ clientPaymentId: posOrder.payments[0].id, amountMinor: 3130 })]);
    const server = { orderCreate: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], register: [1] };
    expect(precheckCommand(envelope, { ...server, cashRounding: true })).toBeUndefined();
    expect(precheckCommand(envelope, server)).toMatchObject({ status: 'rejected', error: { code: 'invalid_payload' } });
  });

  /** An unrounded sale: a custom line, a note and meta, so caps 5, 8 and 12 send versions 5, 7 and 12. */
  function unrounded(capabilities: ServerCapabilities): PosOrder {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 0 } });
    builder.addLine({ productId: 'custom', name: 'Item', custom: true, taxStatus: 'none', unitPrice: { amount: 3125, currency: 'EUR' } });
    builder.setNote('Gift wrap');
    builder.setMeta([{ key: 'po_number', value: 'PO-1' }]);
    builder.addPayment({ method: 'cash', amountMinor: 3125, tenderedMinor: 3130, changeMinor: 5 });
    let nextId = 0;
    return finalizeOrder(builder.getSnapshot(), { now: new Date('2026-11-22T10:00:00.000Z'),
      newId: () => `019f8f66-7800-7000-8000-${String(++nextId).padStart(12, '0')}`, capabilities });
  }
  const id = (n: number) => `019f8f66-7800-7000-8000-${String(n).padStart(12, '0')}`;
  // Pinned at BASE a00e26c3 (the same sale, finalized at orderCreate 12, through BASE's toOrderCreateEnvelope).
  const basePayload = {
    clientOrderId: id(1), createdAt: '2026-11-22T10:00:00.000Z', currency: 'EUR', pricesIncludeTax: false,
    lines: [{ clientLineId: id(2), custom: { name: 'Item', taxStatus: 'none' }, title: 'Item', quantity: 1, unitPriceMinor: 3125 }],
    payments: [{ clientPaymentId: id(3), method: 'cash', amountMinor: 3125, tenderedMinor: 3130, changeMinor: 5 }],
    subtotalMinor: 3125, taxMinor: 0, totalMinor: 3125,
    display: { currency: 'EUR', exponent: 2, taxInclusive: false, subtotalMinor: 3125, discountMinor: 0, taxMinor: 0, totalMinor: 3125,
      lines: [{ clientLineId: id(2), amountMinor: 3125, discounts: [] }], orderDiscountMinor: 0 },
    taxByRate: [{ ratePpm: 0, netMinor: 3125, taxMinor: 0, grossMinor: 3125 }],
  };
  const base = {
    5: { version: 5, payload: { ...basePayload, customer: null } },
    8: { version: 7, payload: { ...basePayload, customer: null, note: 'Gift wrap' } },
    12: { version: 12, payload: { ...basePayload, customer: {}, note: 'Gift wrap', meta: [{ key: 'po_number', value: 'PO-1' }] } },
  } as const;

  it.each([5, 8, 12] as const)('an unrounded sale at cap %i is BASE byte for byte, with or without the flag', (cap) => {
    for (const capabilities of [{ orderCreate: 12 }, carries]) {
      const sent = toOrderCreateEnvelope(unrounded(capabilities), 'device_golden', 1, { maxVersion: cap });
      const expected = { id: id(4), type: 'order.create', version: base[cap].version, createdAt: '2026-11-22T10:00:00.000Z', deviceId: 'device_golden', attempt: 1, payload: base[cap].payload };
      expect(sent).toStrictEqual(expected);
      expect(JSON.stringify(sent)).toBe(JSON.stringify(expected));
      expect('cashRoundings' in sent.payload).toBe(false);
    }
  });
});

// migration.test.ts's own helpers, with the storage typed as createRxDatabase takes it.
type Storage = Parameters<typeof createRxDatabase>[0]['storage'];
async function open(name: string, storage: Storage, collection: RxCollectionCreator) {
  const db = await createRxDatabase({ name, storage, multiInstance: false });
  return { db, added: db.addCollections({ pos_orders: collection }) };
}
async function olderDocument(storage: Storage, databaseName: string, id: string) {
  const raw = await storage.createStorageInstance<PosOrder>({ databaseName, collectionName: 'pos_orders',
    schema: fillWithDefaultSettings(olderCollection(20).schema), options: {}, multiInstance: false, devMode: false, databaseInstanceToken: 'check' });
  const [doc] = await raw.findDocumentsById([id], false);
  await raw.close();
  return doc;
}

describe('from version 20', () => {
  describe('addPosOrderCollection on memory storage', () => addPosOrderCollectionTests(() => getRxStorageMemory(), { from: 20 }));

  it('F3: keeps pending and applied version-20 orders byte for byte at 25, then stores cash roundings', async () => {
    const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 190000, pricesIncludeTax: true } });
    builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: 1190, currency: 'EUR' } });
    builder.addPayment({ method: 'external', methodId: 'card', amountMinor: 500, reference: 'ref-1', takenAt: '2026-11-22T10:15:00.000Z' });
    builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor - 500 });
    const pending = finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 12 } });
    const applied: PosOrder = { ...pending, id: uuidv7(), syncStatus: 'applied', serverRefs: { orderId: 'server-1', totalMinor: pending.totalMinor } };
    const name = `posmigrate${uuidv7().replaceAll('-', '')}`, before = await open(name, storage, olderCollection(20));
    expect((await (await before.added).pos_orders.bulkInsert(structuredClone([pending, applied]))).error).toEqual([]);
    await before.db.close();
    const originals = await Promise.all([pending, applied].map((original) => olderDocument(storage, name, original.id)));
    const db = await createRxDatabase({ name, storage, multiInstance: false });
    try {
      const orders = await addPosOrderCollection(db);
      expect(orders.schema.version).toBe(25);
      for (const [index, original] of [pending, applied].entries()) {
        const migrated = await orders.findOne(original.id).exec();
        expect(migrated?.toJSON()).toStrictEqual(original);
        expect(migrated?.toJSON(true)._meta).toEqual(originals[index]._meta);
      }
      const withRounding = finalizeOrder(rounded(), { capabilities: carries });
      await orders.insert(withRounding);
      expect((await orders.findOne(withRounding.id).exec())?.toJSON()).toStrictEqual(withRounding);
      expect(withRounding.cashRoundings).toEqual([{ paymentId: withRounding.payments[0].id, minor: 5 }]);
    } finally { await db.remove(); }
  });
});

describe('F4: the server shape check for cashRoundings', () => {
  const payload = {
    clientOrderId: 'order_1', createdAt: '2026-11-19T10:00:00Z', currency: 'EUR', pricesIncludeTax: true,
    lines: [{ clientLineId: 'line_1', variantId: 'variant_1', title: 'Coffee', quantity: 1, unitPriceMinor: 1000 }],
    subtotalMinor: 840, taxMinor: 160, totalMinor: 1000, payments: [{ clientPaymentId: 'payment_1', method: 'cash', amountMinor: 1000 }],
    customer: { email: 'ann@example.com', customerId: '42' },
  };

  it('accepts a negative and a positive minor', () => {
    expect(payloadShapeErrors({ ...payload, cashRoundings: [{ paymentId: 'payment_1', minor: -2 }] })).toEqual([]);
    expect(payloadShapeErrors({ ...payload, cashRoundings: [{ paymentId: 'payment_1', minor: 5 }] })).toEqual([]);
  });

  it('refuses a non-integer minor, an empty id and 17 entries', () => {
    expect(payloadShapeErrors({ ...payload, cashRoundings: [{ paymentId: 'payment_1', minor: 1.5 }] }))
      .toEqual(['cashRoundings[0].minor: expected a safe integer']);
    expect(payloadShapeErrors({ ...payload, cashRoundings: [{ paymentId: '', minor: 5 }] }))
      .toEqual(['cashRoundings[0].paymentId: expected a non-empty string']);
    expect(payloadShapeErrors({ ...payload, cashRoundings: Array.from({ length: 17 }, () => ({ paymentId: 'payment_1', minor: 1 })) }))
      .toEqual(['cashRoundings: expected an array of at most 16 entries']);
  });
});

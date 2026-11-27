// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createRxDatabase, type RxCollection } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { ServerCapabilities } from '@tallyui/core';
import { createOrderBuilder } from '../order/order-builder';
import { toOrderCreateEnvelope } from './command';
import { finalizeOrder } from './finalize';
import { addPosOrderCollection } from './open';
import { addPosOrderCollectionTests, olderCollection } from './open.test-helper';
import type { PosOrder } from './types';
import { uuidv7 } from './uuidv7';

const carries = { orderCreate: 12, taxExempt: true };

function sale(taxed?: 'line' | 'fee') {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: taxClass => taxClass === 'standard' ? 190000 : 0 } });
  builder.addLine({ productId: 'p', name: 'Item', taxClass: taxed === 'line' ? 'standard' : 'zero', unitPrice: { amount: 100, currency: 'EUR' } });
  builder.addFee({ name: 'Bag', amountMinor: 20, taxClass: taxed === 'fee' ? 'standard' : 'zero' });
  builder.addShipping({ name: 'Delivery', amountMinor: 50, taxClass: 'zero' });
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  return builder.getSnapshot();
}

it.each([{ orderCreate: 12 }, { orderCreate: 12, taxExempt: false }])('X2 refuses exemption without the capability (%j)', capabilities => {
  expect(() => finalizeOrder({ ...sale(), taxExempt: true }, { capabilities })).toThrow('finalize: a tax-exempt sale needs a store whose connector declares the taxExempt capability');
});

it('X3 stores exemption and sends it at the same content version as an ordinary sale', () => {
  const snapshot = sale(), options = { capabilities: carries };
  const stored = finalizeOrder({ ...snapshot, taxExempt: true }, options);
  expect(stored.taxExempt).toBe(true);
  const sent = toOrderCreateEnvelope(stored, 'till', 1, { maxVersion: 12 });
  expect(sent.version).toBe(toOrderCreateEnvelope(finalizeOrder(snapshot, options), 'till', 1, { maxVersion: 12 }).version);
  expect(sent).toMatchObject({ version: 5, payload: { taxExempt: true, taxMinor: 0,
    lines: [{ variantId: 'p' }], fees: [{ taxMinor: 0 }], shipping: [{ taxMinor: 0 }] } });
});

it.each([['X5', 'line'], ['X6', 'fee']] as const)('%s refuses an exempt sale with a taxed %s', (_, taxed) => {
  const snapshot = sale(taxed);
  expect(BigInt(snapshot.lineItems[0].taxMicros) > 0n).toBe(taxed === 'line');
  expect(BigInt(snapshot.fees![0].taxMicros) > 0n).toBe(taxed === 'fee');
  expect(() => finalizeOrder({ ...snapshot, taxExempt: true }, { capabilities: carries })).toThrow('finalize: a tax-exempt sale must carry no tax');
});

it('X7 refuses exemption on a reopened sale', () => {
  expect(() => finalizeOrder({ ...sale(), storeOrder: { id: 'store', revision: '1' }, taxExempt: true }, { capabilities: carries }))
    .toThrow('finalize: a reopened store order cannot be made tax exempt');
});

it('X15 refuses an exempt sale with tax on the coupon alone', () => {
  const coupons = [{ code: 'ten', couponId: '1', discountMinor: 10, discountTaxMinor: 3 }];
  expect(() => finalizeOrder({ ...sale(), taxExempt: true, coupons }, { capabilities: carries })).toThrow('finalize: a tax-exempt sale must carry no tax');
});

it('X16 refuses an exempt sale with tax on a coupon line alone', () => {
  const snapshot = sale();
  const coupons = [{ code: 'ten', couponId: '1', discountMinor: 10, discountTaxMinor: 0,
    lines: [{ lineId: snapshot.lineItems[0].id, discountMinor: 10, discountTaxMinor: 3 }] }];
  expect(() => finalizeOrder({ ...snapshot, taxExempt: true, coupons }, { capabilities: carries })).toThrow('finalize: a tax-exempt sale must carry no tax');
});

it('X17 refuses an exempt sale with sub-cent line tax even when order tax is zero', () => {
  const snapshot = sale();
  const lineItems = [{ ...snapshot.lineItems[0], taxMicros: '4000' }];
  expect(snapshot.taxMinor).toBe(0);
  expect(() => finalizeOrder({ ...snapshot, taxExempt: true, lineItems }, { capabilities: carries })).toThrow('finalize: a tax-exempt sale must carry no tax');
});

describe('from version 23 on memory storage', () => addPosOrderCollectionTests(() => getRxStorageMemory(), { from: 23 }));

it('X14 preserves pending and applied v23 orders and their metadata, then round-trips an exempt order', async () => {
  const name = `exempt${uuidv7().replaceAll('-', '')}`, storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
  const pending = finalizeOrder(sale(), { capabilities: carries });
  const applied: PosOrder = { ...pending, id: uuidv7(), commandId: uuidv7(), syncStatus: 'applied', serverRefs: { orderId: 'store', totalMinor: pending.totalMinor } };
  const before = await createRxDatabase<{ pos_orders: RxCollection<PosOrder> }>({ name, storage, multiInstance: false });
  const { pos_orders } = await before.addCollections({ pos_orders: olderCollection(23) });
  const originals = await Promise.all([pending, applied].map(async order => (await pos_orders.insert(order)).toJSON(true)));
  await before.close();
  const db = await createRxDatabase({ name, storage, multiInstance: false });
  try {
    const orders = await addPosOrderCollection(db);
    expect(orders.schema.version).toBe(24);
    for (const [index, order] of [pending, applied].entries()) {
      const migrated = (await orders.findOne(order.id).exec())!;
      expect(migrated.toJSON()).toStrictEqual(order);
      expect(migrated.toJSON(true)._meta).toEqual(originals[index]._meta);
    }
    const exempt = finalizeOrder({ ...sale(), taxExempt: true }, { capabilities: carries });
    await orders.insert(exempt);
    expect((await orders.findOne(exempt.id).exec())?.toJSON()).toStrictEqual(exempt);
  } finally { await db.remove(); }
});

/** An ordinary sale: a custom line, a note and meta, so caps 5, 8 and 12 send versions 5, 7 and 12. */
function ordinary(capabilities: ServerCapabilities): PosOrder {
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

it.each([5, 8, 12] as const)('X1: an ordinary sale at cap %i is BASE byte for byte, with or without the flag', (cap) => {
  for (const capabilities of [{ orderCreate: 12 }, carries]) {
    const stored = ordinary(capabilities);
    expect(stored).not.toHaveProperty('taxExempt');
    const sent = toOrderCreateEnvelope(stored, 'device_golden', 1, { maxVersion: cap });
    const expected = { id: id(4), type: 'order.create', version: base[cap].version, createdAt: '2026-11-22T10:00:00.000Z', deviceId: 'device_golden', attempt: 1, payload: base[cap].payload };
    expect(sent).toStrictEqual(expected);
    expect(JSON.stringify(sent)).toBe(JSON.stringify(expected));
    expect('taxExempt' in sent.payload).toBe(false);
  }
});

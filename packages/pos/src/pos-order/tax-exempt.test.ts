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
  expect(() => finalizeOrder({ ...sale(), taxExempt: true, coupons }, { capabilities: { ...carries, taxExemptCoupons: true } })).toThrow('finalize: a tax-exempt sale must carry no tax');
});

it('X16 refuses an exempt sale with tax on a coupon line alone', () => {
  const snapshot = sale();
  const coupons = [{ code: 'ten', couponId: '1', discountMinor: 10, discountTaxMinor: 0,
    lines: [{ lineId: snapshot.lineItems[0].id, discountMinor: 10, discountTaxMinor: 3 }] }];
  expect(() => finalizeOrder({ ...snapshot, taxExempt: true, coupons }, { capabilities: { ...carries, taxExemptCoupons: true } })).toThrow('finalize: a tax-exempt sale must carry no tax');
});

it.each(['C5', 'C6', 'C7', 'C8'])('%s requires taxExemptCoupons only for an exempt sale with coupons', row => {
  const capabilities = { ...carries, ...(row === 'C6' ? { taxExemptCoupons: true } : {}) };
  const snapshot = { ...sale(), ...(row !== 'C7' ? { taxExempt: true as const } : {}),
    ...(row !== 'C8' ? { coupons: [{ code: 'ten', couponId: '1', discountMinor: 0, discountTaxMinor: 0 }] } : {}) };
  const finalize = () => finalizeOrder(snapshot, { capabilities });
  if (row === 'C5') expect(finalize).toThrow('finalize: a tax-exempt sale with a coupon needs a store whose connector declares the taxExemptCoupons capability');
  else expect(finalize()).toMatchObject({ totalMinor: snapshot.totalMinor });
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
    expect(orders.schema.version).toBe(25);
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

import { payloadShapeErrors } from '@tallyui/core/server';
import type { TaxContext } from '../tax/types';
import { withSentForm } from './finalize';

function builderForExemption(fixture: 'E1' | 'E3' | 'E4a' | 'E4w' | 'E4x' | 'E5' | 'G4' | 'G5' | 'G8') {
  const woo = fixture === 'E3' || fixture === 'E4w' || fixture === 'E4x' || fixture === 'G5';
  const taxContext: TaxContext = woo ? { pricesIncludeTax: false, rounding: { granularity: 'woocommerce', roundAtSubtotal: false },
    getTaxRatePpm: () => { throw new Error('WooCommerce must use the rate list'); }, shippingTaxClass: 'inherit',
    getTaxRates: () => [{ id: 1, code: 'rate-1', label: 'Rate 1', rate: '10.0000', priority: 1, compound: false, shipping: true }] }
    : { pricesIncludeTax: false, rounding: { granularity: 'per_line_items', mode: 'half_up' }, getTaxRateCode: taxClass => taxClass,
      getTaxRatePpm: taxClass => taxClass === 'fee' ? 210000 : taxClass === 'post' ? 77000 : 190000 };
  const builder = createOrderBuilder({ currency: 'EUR', taxContext }), price = (amount: number) => ({ amount, currency: 'EUR' });
  if (fixture === 'G4' || fixture === 'G5' || fixture === 'G8') {
    const entry = { amountMinor: woo ? 907 : 902, amountIncludesTax: true };
    builder.addLine({ productId: '1', name: 'Item', taxClass: 'standard', unitPrice: price(1000) });
    builder.addFee({ ...entry, name: 'Fee', taxClass: woo ? 'standard' : 'fee' });
    builder.addShipping({ ...entry, name: 'Post', taxClass: woo ? 'standard' : 'post' });
  } else if (fixture === 'E1' || fixture === 'E3') {
    const item = { name: 'Item', taxClass: 'standard' };
    const line = builder.addLine({ ...item, productId: '1', unitPrice: price(1000) });
    builder.addLine({ ...item, productId: 'custom', custom: true, unitPrice: price(300) });
    if (!woo) builder.addLine({ ...item, productId: '2', unitPrice: price(500), taxRates: [{ code: 'given', ratePpm: 190000 }] });
    builder.addFee({ ...item, amountMinor: 200 });
    builder.addShipping({ ...item, amountMinor: 103 });
    builder.applyLineDiscount(line, { id: 'discount', type: 'fixed', value: 70 });
    builder.applyOrderDiscount({ id: 'order-discount', type: 'fixed', value: 30 });
  } else {
    builder.addLine({ productId: '1', name: 'Item', unitPrice: price(100) });
    if (fixture === 'E5') builder.addLine({ productId: '2', name: 'Inclusive', unitPrice: { ...price(119), taxInclusive: true } });
    else if (fixture === 'E4w') {
      for (const name of ['A', 'B']) builder.addFee({ name, amountMinor: 5, amountIncludesTax: true });
      builder.addShipping({ name: 'Free', amountMinor: 0 });
    } else {
      builder.addFee({ name: 'Fee', amountMinor: 999, amountIncludesTax: true, taxClass: 'fee' });
      builder.addShipping({ name: 'Post', amountMinor: 999, amountIncludesTax: true, taxClass: 'post' });
    }
  }
  if (fixture !== 'G8') builder.setTaxExempt(true);
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  return builder.getSnapshot();
}

it('E11 finalize refuses exempt inclusive stores and converted products', () => {
  const options = { capabilities: carries };
  expect(() => finalizeOrder({ ...builderForExemption('E1'), pricesIncludeTax: true }, options))
    .toThrow(new Error('finalize: tax exemption is not available on a prices-include-tax store'));
  expect(() => finalizeOrder(builderForExemption('E5'), options))
    .toThrow(new Error('finalize: a tax-exempt sale cannot carry a line priced in the other tax mode'));
});

it.each(['E1', 'E3', 'E4w', 'E4a'] as const)('E12 finalizes %s at the displayed charge amounts without storing the taxed order', fixture => {
  const order = builderForExemption(fixture), posOrder = finalizeOrder(order, { capabilities: { ...carries, chargeTaxMode: true } });
  expect(posOrder.taxExempt).toBe(true);
  expect(JSON.stringify(posOrder)).not.toContain('exemptedFrom');
  expect(withSentForm(order, posOrder)).not.toHaveProperty('exemptedFrom');
  for (const key of ['fees', 'shipping'] as const) expect(posOrder[key]?.map(row => row.amountMinor)).toEqual(order.display[key]?.map(row => row.amountMinor));
  const { payload } = toOrderCreateEnvelope(posOrder, 'till', 1, { maxVersion: 12 });
  expect(JSON.stringify(payload)).not.toContain('exemptedFrom');
  expect(payloadShapeErrors(payload)).toEqual([]);
});

it('E12x finalizes inclusive Woo fees and shipping at their exempt nets', () => {
  const order = builderForExemption('E4x'), posOrder = finalizeOrder(order, { capabilities: { ...carries, chargeTaxMode: true } });
  for (const key of ['fees', 'shipping'] as const) {
    const net = order.exemptedFrom![key]![0].netMinor;
    expect(posOrder[key]).toMatchObject([{ totalMinor: net, amountMinor: net }]);
  }
  const { payload } = toOrderCreateEnvelope(posOrder, 'till', 1, { maxVersion: 12 });
  expect(payloadShapeErrors(payload)).toEqual([]);
});

it.each([['G4', 902, 745, 838], ['G5', 907, 825, 825]] as const)(
  '%s stores inclusive entries beside exempt nets without sending the entries', (fixture, amountMinor, feeNet, shippingNet) => {
    const stored = finalizeOrder(builderForExemption(fixture), { capabilities: carries });
    const taxedEntry = { amountMinor, amountIncludesTax: true };
    expect(stored.fees).toMatchObject([{ amountMinor: feeNet, taxedEntry }]);
    expect(stored.shipping).toMatchObject([{ amountMinor: shippingNet, taxedEntry }]);
    const { payload } = toOrderCreateEnvelope(stored, 'till', 1, { maxVersion: 12 });
    expect(JSON.stringify(payload)).not.toContain('taxedEntry');
    expect(payloadShapeErrors(payload)).toEqual([]);
  });

it('G8 keeps entered but not taxedEntry on a non-exempt sale', () => {
  const stored = finalizeOrder(builderForExemption('G8'), { capabilities: carries });
  for (const key of ['fees', 'shipping'] as const) {
    expect(stored[key]![0]).not.toHaveProperty('taxedEntry');
    expect(stored[key]![0].entered).toEqual({ amountMinor: 902, amountIncludesTax: true });
  }
});

it('G9 rejects an explicit false taxExempt in v25', async () => {
  const db = await createRxDatabase({ name: `exempt${uuidv7().replaceAll('-', '')}`, multiInstance: false,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }) });
  try {
    const orders = await addPosOrderCollection(db);
    await expect(orders.insert({ ...finalizeOrder(sale(), { capabilities: carries }), taxExempt: false } as unknown as PosOrder)).rejects.toMatchObject({ code: 'VD2' });
  } finally { await db.remove(); }
});

it('G15 keeps the taxed twin’s generic line rates locally on exempt sales only', () => {
  const builder = createOrderBuilder({ currency: 'AUD', taxContext: { pricesIncludeTax: false,
    rounding: { granularity: 'per_line_items', mode: 'half_up' }, getTaxRateCode: taxClass => taxClass,
    getTaxRatePpm: taxClass => taxClass === 'reduced' ? 70000 : 190000 } });
  const unitPrice = { amount: 1000, currency: 'AUD' };
  builder.addLine({ productId: 'A', name: 'A', taxClass: 'reduced', unitPrice });
  builder.addLine({ productId: 'B', name: 'B', taxClass: 'standard', unitPrice });
  builder.setTaxExempt(true);
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  const stored = finalizeOrder(builder.getSnapshot(), { capabilities: carries });
  expect(stored.lines.map(line => line.taxedRates)).toEqual([[{ code: 'reduced', ratePpm: 70000 }], [{ code: 'standard', ratePpm: 190000 }]]);
  const { payload } = toOrderCreateEnvelope(stored, 'till', 1, { maxVersion: 12 });
  expect(JSON.stringify(payload)).not.toContain('taxedRates');
  expect(payloadShapeErrors(payload)).toEqual([]);
  for (const fixture of ['G8', 'G5'] as const) {
    const order = finalizeOrder(builderForExemption(fixture), { capabilities: carries });
    for (const line of order.lines) expect(line).not.toHaveProperty('taxedRates');
  }
});

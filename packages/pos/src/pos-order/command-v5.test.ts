// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { precheckCommand } from '@tallyui/core/server';
import { createOrderBuilder } from '../order/order-builder';
import { woocommerceTaxByRate } from '../order/woocommerce-tax';
import { contentVersion, toOrderCreateEnvelope, UnsupportedOrderVersionError } from './command';
import { finalizeOrder, freezeSentForm, withSentForm } from './finalize';
import { posOrderCollection } from './schema';
import type { PosOrder } from './types';
import { uuidv7 } from './uuidv7';

const supported = { orderCreate: [1, 2, 3, 4, 5], register: [1] };
const options = { capabilities: { orderCreate: 5 }, now: new Date('2026-10-06T10:00:00.000Z') };
const make = (pricesIncludeTax = false) => createOrderBuilder({ currency: 'EUR',
  taxContext: { pricesIncludeTax, getTaxRatePpm: () => 200000 } });

describe('order.create v5 through builder and finalize (ADR-075)', () => {
  it.each([[false, false], [false, true], [true, false], [true, true]])(
    'stores WooCommerce netMicros without sending it (inclusive: %s, roundAtSubtotal: %s)', async (pricesIncludeTax, roundAtSubtotal) => {
      const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax, getTaxRatePpm: () => 200000,
        rounding: { granularity: 'woocommerce', roundAtSubtotal },
        getTaxRates: () => [{ id: 1, code: 'standard', label: 'Standard', rate: '20', priority: 1, compound: false, shipping: true }] } });
      builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: 100, currency: 'EUR' } });
      builder.addFee({ name: 'Bag', amountMinor: 20, taxClass: 'standard' });
      builder.addShipping({ name: 'Delivery', amountMinor: 30, taxClass: 'standard', methodId: 'flat_rate' });
      builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
      const snapshot = builder.getSnapshot(), order = finalizeOrder(snapshot, options);
      for (const field of ['lines', 'fees', 'shipping'] as const) {
        const original = field === 'lines' ? snapshot.lineItems[0] : snapshot[field]![0];
        expect(original.netMicros).toEqual(expect.any(String));
        expect(order[field]![0].netMicros).toBe(original.netMicros);
      }
      const envelope = toOrderCreateEnvelope(order, 'till');
      expect(envelope.version).toBe(5);
      expect(JSON.stringify(envelope)).not.toContain('netMicros');
      expect(precheckCommand(envelope, supported)).toBeUndefined();
      const db = await createRxDatabase({ name: `net${uuidv7().replaceAll('-', '')}`,
        storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
      try {
        const { pos_orders } = await db.addCollections({ pos_orders: posOrderCollection() });
        expect(pos_orders.schema.version).toBe(9);
        expect((await pos_orders.insert(order)).toJSON()).toStrictEqual(order);
      } finally { await db.remove(); }
    });

  it('keeps the per_order finalized form without netMicros', () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 200000,
      rounding: { granularity: 'per_order', mode: 'half_away_from_zero' } } });
    builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: 100, currency: 'EUR' } });
    builder.addFee({ name: 'Bag', amountMinor: 20, taxClass: 'standard' });
    builder.addShipping({ name: 'Delivery', amountMinor: 30, taxClass: 'standard', methodId: 'flat_rate' });
    builder.addPayment({ method: 'external', amountMinor: 180 });
    const snapshot = builder.getSnapshot();
    let nextId = 0;
    const order = finalizeOrder(snapshot, { ...options, newId: () => `id-${++nextId}` });
    expect(order).toStrictEqual({
      id: 'id-1', saleId: snapshot.id, createdAt: '2026-10-06T10:00:00.000Z', updatedAt: '2026-10-06T10:00:00.000Z',
      commandId: 'id-6', syncStatus: 'pending', currency: 'EUR', pricesIncludeTax: false, customer: null,
      lines: [{ id: 'id-2', productId: 'p', name: 'Item', sku: '', quantity: 1, unitPriceMinor: 100,
        discountMinor: 0, netMinor: 100, taxLines: [{ ratePpm: 200000, taxMicros: '20000000' }] }],
      fees: [{ id: 'id-3', name: 'Bag', amountMinor: 20, taxClass: 'standard', taxStatus: 'taxable',
        netMinor: 20, taxMicros: '4000000', taxLines: [{ ratePpm: 200000, taxMicros: '4000000' }] }],
      shipping: [{ id: 'id-4', name: 'Delivery', amountMinor: 30, taxClass: 'standard', taxStatus: 'taxable', methodId: 'flat_rate',
        netMinor: 30, taxMicros: '6000000', taxLines: [{ ratePpm: 200000, taxMicros: '6000000' }] }],
      payments: [{ id: 'id-5', method: 'external', amountMinor: 180 }],
      subtotalMinor: 100, discountMinor: 0, taxMinor: 30, totalMinor: 180,
      taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' },
      display: { currency: 'EUR', exponent: 2, taxInclusive: false, subtotalMinor: 100, discountMinor: 0,
        taxMinor: 30, totalMinor: 180, orderDiscountMinor: 0, lines: [{ lineId: 'id-2', amountMinor: 100, discounts: [] }],
        fees: [{ id: 'id-3', name: 'Bag', amountMinor: 20 }], shipping: [{ id: 'id-4', name: 'Delivery', amountMinor: 30 }] },
      taxByRate: [{ ratePpm: 200000, netMinor: 150, amountMinor: 30, grossMinor: 180 }],
    });
    for (const field of ['lines', 'fees', 'shipping'] as const) expect(order[field]![0]).not.toHaveProperty('netMicros');
  });

  it('omits stored charge display rows from a version-3 envelope', () => {
    const order: PosOrder = {
      id: uuidv7(), commandId: uuidv7(), createdAt: options.now.toISOString(), updatedAt: options.now.toISOString(),
      currency: 'EUR', pricesIncludeTax: false, syncStatus: 'pending', customer: null,
      subtotalMinor: 100, discountMinor: 0, taxMinor: 20, totalMinor: 120,
      lines: [{ id: 'line', productId: 'product', name: 'Item', sku: '', quantity: 1, unitPriceMinor: 100,
        discountMinor: 0, netMinor: 100, taxLines: [{ ratePpm: 200000, taxMicros: '20000000' }] }],
      payments: [{ id: 'payment', method: 'external', amountMinor: 120 }],
      taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' },
      display: { currency: 'EUR', exponent: 2, taxInclusive: false, subtotalMinor: 100, discountMinor: 0,
        taxMinor: 20, totalMinor: 120, orderDiscountMinor: 0, lines: [{ lineId: 'line', amountMinor: 100, discounts: [] }],
        fees: [{ id: 'fee', name: 'Bag', amountMinor: 20 }], shipping: [{ id: 'shipping', name: 'Delivery', amountMinor: 100 }] },
      taxByRate: [{ ratePpm: 200000, netMinor: 100, amountMinor: 20, grossMinor: 120 }],
    };
    const envelope = toOrderCreateEnvelope(order, 'till', 1, { maxVersion: 3 });
    expect(envelope.version).toBe(3);
    expect(envelope.payload.display).not.toHaveProperty('fees');
    expect(envelope.payload.display).not.toHaveProperty('shipping');
    expect(precheckCommand(envelope, supported)).toBeUndefined();
  });

  it.each([undefined, false, true])('keeps a custom tax class through finalize (WooCommerce roundAtSubtotal: %s)', (roundAtSubtotal) => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 200000,
      ...(roundAtSubtotal !== undefined ? { rounding: { granularity: 'woocommerce' as const, roundAtSubtotal },
        getTaxRates: () => [{ id: 1, code: 'standard', label: 'Standard', rate: '20', priority: 1, compound: false, shipping: true }] } : {}) } });
    for (const taxClass of ['standard', undefined]) builder.addLine({ productId: `custom:${uuidv7()}`, custom: true,
      name: 'Custom item', taxClass, unitPrice: { amount: 100, currency: 'EUR' } });
    builder.addLine({ productId: 'catalogue', name: 'Catalogue item', taxClass: 'standard', unitPrice: { amount: 100, currency: 'EUR' } });
    const snapshot = builder.getSnapshot();
    expect(snapshot.lineItems[0].taxClass).toBe('standard');
    expect(snapshot.lineItems[1]).not.toHaveProperty('taxClass');
    if (roundAtSubtotal === undefined) expect(snapshot.lineItems[2]).not.toHaveProperty('taxClass');
    builder.addPayment({ method: 'cash', amountMinor: snapshot.totalMinor });
    const envelope = toOrderCreateEnvelope(finalizeOrder(builder.getSnapshot(), options), 'till');
    expect(envelope.payload.lines[0].custom).toEqual({ name: 'Custom item', taxClass: 'standard', taxStatus: 'taxable' });
    expect(envelope.payload.lines[1].custom).toEqual({ name: 'Custom item', taxStatus: 'taxable' });
    expect(envelope.payload.lines[2]).toEqual({ clientLineId: envelope.payload.lines[2].clientLineId, variantId: 'catalogue',
      title: 'Catalogue item', quantity: 1, unitPriceMinor: 100 });
    expect(precheckCommand(envelope, supported)).toBeUndefined();
  });

  it('matches handoff §3.1: Coffee beans 10.00 and Bag 0.20, exclusive 20%', () => {
    const builder = make();
    builder.addLine({ productId: 'var_123', name: 'Coffee beans', unitPrice: { amount: 1000, currency: 'EUR' } });
    builder.addFee({ name: 'Bag', amountMinor: 20 });
    builder.addPayment({ method: 'cash', amountMinor: 1224 });
    const order = finalizeOrder(builder.getSnapshot(), options);
    const envelope = toOrderCreateEnvelope(order, 'till');
    const clientLineId = order.lines[0].id, clientFeeId = order.fees![0].id;
    expect(envelope.version).toBe(5);
    expect(envelope.payload).toEqual({
      clientOrderId: order.id, createdAt: order.createdAt, currency: 'EUR', pricesIncludeTax: false,
      lines: [{ clientLineId, variantId: 'var_123', title: 'Coffee beans', quantity: 1, unitPriceMinor: 1000 }],
      fees: [{ clientFeeId, name: 'Bag', amountMinor: 20, taxStatus: 'taxable', taxMinor: 4 }],
      subtotalMinor: 1000, taxMinor: 204, totalMinor: 1224, customer: null,
      payments: [{ clientPaymentId: order.payments[0].id, method: 'cash', amountMinor: 1224, tenderedMinor: 1224, changeMinor: 0 }],
      display: { currency: 'EUR', exponent: 2, taxInclusive: false, subtotalMinor: 1000, discountMinor: 0,
        taxMinor: 204, totalMinor: 1224, orderDiscountMinor: 0, lines: [{ clientLineId, amountMinor: 1000, discounts: [] }],
        fees: [{ clientFeeId, amountMinor: 20 }] },
      taxByRate: [{ ratePpm: 200000, netMinor: 1020, taxMinor: 204, grossMinor: 1224 }],
    });
    expect(precheckCommand(envelope, supported)).toBeUndefined();
    expect(JSON.stringify(toOrderCreateEnvelope(order, 'till'))).toBe(JSON.stringify(envelope));
  });

  it('matches handoff §3.2: Scarf 25.00, tax-free Gift wrap 3.00 and Local delivery 5.00', () => {
    const builder = make();
    builder.addLine({ productId: 'var_456', name: 'Scarf', unitPrice: { amount: 2500, currency: 'EUR' } });
    builder.addLine({ productId: `custom:${uuidv7()}`, custom: true, name: 'Gift wrap', taxStatus: 'none',
      unitPrice: { amount: 300, currency: 'EUR' } });
    builder.addShipping({ name: 'Local delivery', methodId: 'flat_rate', amountMinor: 500 });
    builder.addPayment({ method: 'external', amountMinor: 3900 });
    const order = finalizeOrder(builder.getSnapshot(), options);
    const envelope = toOrderCreateEnvelope(order, 'till');
    const [product, custom] = order.lines, clientShippingId = order.shipping![0].id;
    expect(envelope.version).toBe(5);
    expect(envelope.payload).toEqual({
      clientOrderId: order.id, createdAt: order.createdAt, currency: 'EUR', pricesIncludeTax: false,
      lines: [
        { clientLineId: product.id, variantId: 'var_456', title: 'Scarf', quantity: 1, unitPriceMinor: 2500 },
        { clientLineId: custom.id, title: 'Gift wrap', quantity: 1, unitPriceMinor: 300, custom: { name: 'Gift wrap', taxStatus: 'none' } },
      ],
      shipping: [{ clientShippingId, name: 'Local delivery', methodId: 'flat_rate', amountMinor: 500, taxStatus: 'taxable', taxMinor: 100 }],
      subtotalMinor: 2800, taxMinor: 600, totalMinor: 3900, customer: null,
      payments: [{ clientPaymentId: order.payments[0].id, method: 'external', amountMinor: 3900 }],
      display: { currency: 'EUR', exponent: 2, taxInclusive: false, subtotalMinor: 2800, discountMinor: 0,
        taxMinor: 600, totalMinor: 3900, orderDiscountMinor: 0,
        lines: [{ clientLineId: product.id, amountMinor: 2500, discounts: [] }, { clientLineId: custom.id, amountMinor: 300, discounts: [] }],
        shipping: [{ clientShippingId, amountMinor: 500 }] },
      taxByRate: [{ ratePpm: 200000, netMinor: 3000, taxMinor: 600, grossMinor: 3600 }, { ratePpm: 0, netMinor: 300, taxMinor: 0, grossMinor: 300 }],
    });
    expect(precheckCommand(envelope, supported)).toBeUndefined();
  });

  it.each(['fee', 'shipping', 'custom'] as const)('gates %s at completion and never downgrades its envelope', (kind) => {
    const builder = make();
    builder.addLine({ productId: 'p', name: 'Item', ...(kind === 'custom' ? { custom: true as const } : {}),
      unitPrice: { amount: 100, currency: 'EUR' } });
    if (kind === 'fee') builder.addFee({ name: 'Bag', amountMinor: 0 });
    if (kind === 'shipping') builder.addShipping({ name: 'Delivery', amountMinor: 0 });
    for (const orderCreate of [undefined, 1, 2, 3, 4]) {
      expect(() => finalizeOrder(builder.getSnapshot(), { capabilities: orderCreate === undefined ? undefined : { orderCreate } })).toThrow(
        "finalize: fees, shipping and custom lines need the store to accept order.create version 5; update the store's TallyUI plugin");
    }
    builder.addPayment({ method: 'cash', amountMinor: 120 });
    const order = finalizeOrder(builder.getSnapshot(), options);
    expect(contentVersion(order)).toBe(5);
    for (const cap of [1, 2, 3, 4]) {
      expect(() => toOrderCreateEnvelope(order, 'till', 1, { maxVersion: cap })).toThrow(new UnsupportedOrderVersionError(5, cap));
      expect(() => toOrderCreateEnvelope({ ...order, sentVersion: cap as 1 | 2 | 3 | 4 }, 'till')).toThrow(UnsupportedOrderVersionError);
    }
    expect(toOrderCreateEnvelope(order, 'till', 1, { maxVersion: 5 }).version).toBe(5);
  });

  it('copies charge fields and custom instructions, cuts names and stores the closed v8 objects', async () => {
    const builder = make(true), name = 'a'.repeat(300);
    const customId = builder.addLine({ productId: `custom:${uuidv7()}`, custom: true, name, sku: 'MISC', taxClass: 'standard',
      unitPrice: { amount: 1200, currency: 'EUR' } });
    builder.applyLineDiscount(customId, { type: 'fixed', value: 120 });
    builder.addFee({ name, amountMinor: 120, taxClass: 'standard' });
    builder.addShipping({ name, amountMinor: 240, methodId: 'flat_rate', taxStatus: 'none' });
    builder.addPayment({ method: 'cash', amountMinor: 1440 });
    const snapshot = builder.getSnapshot(), before = structuredClone(snapshot);
    const order = finalizeOrder(snapshot, options);
    expect(snapshot).toStrictEqual(before);
    for (const field of ['fees', 'shipping'] as const) {
      const charge = order[field]![0], original = snapshot[field]![0];
      expect(charge).toEqual({ ...original, id: charge.id, name: 'a'.repeat(254) + '…' });
      expect(charge.id).not.toBe(original.id);
      expect(charge.id).toMatch(/^[0-9a-f-]{14}7[0-9a-f-]{21}$/);
      expect(charge.taxLines[0]).not.toBe(original.taxLines[0]);
      expect(order.display![field]![0]).toMatchObject({ id: charge.id, name: charge.name });
      expect(withSentForm(snapshot, order)[field]![0].name).toBe(charge.name);
    }
    expect(order.lines[0].custom).toEqual({ name: order.lines[0].name, sku: 'MISC', taxClass: 'standard', taxStatus: 'taxable' });
    expect(freezeSentForm(order)).toBe(order);
    const envelope = toOrderCreateEnvelope(order, 'till');
    expect(envelope.payload.lines[0]).not.toHaveProperty('variantId');
    expect(envelope.payload.lines[0].discountMinor).toBe(100);
    expect(envelope.payload.discountMinor).toBe(100);
    expect(envelope.payload.fees![0]).toMatchObject({ amountMinor: 120, taxMinor: 20, taxClass: 'standard' });
    expect(precheckCommand(envelope, supported)).toBeUndefined();
    const db = await createRxDatabase({ name: `v5${uuidv7().replaceAll('-', '')}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    try {
      const { pos_orders } = await db.addCollections({ pos_orders: posOrderCollection() });
      const stored = JSON.parse(JSON.stringify({ ...order, sentVersion: 5, downgradedFrom: 5 }));
      expect((await pos_orders.insert(stored)).toJSON()).toStrictEqual(stored);
      await expect(pos_orders.insert({ ...stored, id: uuidv7(), fees: [{ ...stored.fees[0], extra: true }] })).rejects.toMatchObject({ code: 'VD2' });
      await expect(pos_orders.insert({ ...stored, id: uuidv7(), shipping: [{ ...stored.shipping[0], methodId: 'x'.repeat(65) }] })).rejects.toMatchObject({ code: 'VD2' });
    } finally { await db.remove(); }
  });

  it.each([false, true])('stores WooCommerce rounding as computed (roundAtSubtotal: %s)', async (roundAtSubtotal) => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: true, getTaxRatePpm: () => 100000,
      rounding: { granularity: 'woocommerce', roundAtSubtotal },
      getTaxRates: () => [1, 2].map((id) => ({ id, code: `rate-${id}`, label: `Rate ${id}`, rate: '5', priority: 1, compound: false, shipping: true })) } });
    builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: 100, currency: 'EUR' } });
    builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
    const order = finalizeOrder(builder.getSnapshot(), options);
    expect(order.taxRounding).toEqual({ granularity: 'woocommerce', roundAtSubtotal });
    expect(order.totalMinor).toBe(builder.getSnapshot().totalMinor);
    expect(order).toMatchObject({ subtotalMinor: 91, taxMinor: roundAtSubtotal ? 9 : 10, totalMinor: roundAtSubtotal ? 100 : 101 });
    expect(order.taxByRate!.map((row) => row.amountMinor)).toEqual(roundAtSubtotal ? [5, 4] : [5, 5]);
    expect(order.taxByRate!.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(order.taxMinor);
    const db = await createRxDatabase({ name: `woo${uuidv7().replaceAll('-', '')}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    try {
      const { pos_orders } = await db.addCollections({ pos_orders: posOrderCollection() });
      expect((await pos_orders.insert(order)).toJSON()).toStrictEqual(order);
    } finally { await db.remove(); }
  });

  it.each([3, -3])('refuses a WooCommerce by-rate residue of %s beyond its bound', (residue) => {
    const lines = [{ netMinor: 91, taxInclusive: true, taxLines: [1, 2].map((rateId) => ({
      code: `rate-${rateId}`, rateId, ratePpm: 50000, taxMicros: '4545000',
    })) }];
    expect(woocommerceTaxByRate(lines, true).map((row) => row.amountMinor)).toEqual([5, 5]);
    expect(() => woocommerceTaxByRate(lines, true, undefined, 10 + residue))
      .toThrow(`woocommerce tax by rate: residue ${residue} exceeds its bound 2 (ADR-076)`);
  });
});

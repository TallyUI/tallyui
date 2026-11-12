// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { CommandResult, OrderCreateEnvelope, woocommerceTax } from '@tallyui/core';
import { payloadBoundErrors, payloadShapeErrors, precheckCommand } from '@tallyui/core/server';
import { createOrderBuilder } from '../order/order-builder';
import type { CustomerSummary } from '../order/types';
import { createOrderOutbox } from '../outbox/order-outbox';
import type { CommandTransport } from '../outbox/types';
import { TAX_ADDRESS_ORDER_CREATE_VERSION, toOrderCreateEnvelope, UnsupportedOrderVersionError } from './command';
import { finalizeOrder } from './finalize';
import { posOrderCollection } from './schema';

const fixturePath = fileURLToPath(new URL('./__fixtures__/order-create-v8.json', import.meta.url));
const supported = { orderCreate: [1, 2, 3, 4, 5, 6, 7, 8], register: [1] };
const customer: CustomerSummary = { id: '42', name: 'Ann Lee', email: 'ann@example.com',
  billing: { firstName: 'Ann', lastName: 'Lee', address1: '1 Main St', city: 'Albany', state: 'NY', postcode: '12207', country: 'US',
    phone: '555-0100', email: 'billing@example.com', company: '' },
  shipping: { firstName: 'Ann', city: 'Portland', state: 'OR', postcode: '97201', country: 'US' } };
const billingLocation: woocommerceTax.ResolvedTaxLocation = { taxBasedOn: 'billing', addressUsed: 'billing',
  location: { country: 'US', state: 'NY', city: 'Albany', postcode: '12207' } };
const baseLocation: woocommerceTax.ResolvedTaxLocation = { taxBasedOn: 'billing', addressUsed: 'base',
  location: { country: 'US', state: 'CA', city: 'San Francisco', postcode: '94105' } };

function sale({ coupons = false, note = '', taxLocation = billingLocation as woocommerceTax.ResolvedTaxLocation | null } = {}) {
  const builder = createOrderBuilder({ currency: 'USD', taxContext: {
    pricesIncludeTax: false, rounding: { granularity: 'woocommerce', roundAtSubtotal: false }, getTaxRatePpm: () => 40000,
    getTaxRates: () => [{ id: 2, code: 'US-NY-TAX-1', label: 'Tax', rate: '4.0000', priority: 1, compound: false, shipping: true }],
  }, couponContext: {
    configs: new Map([['ten', { discount_type: 'percent', amount: '10', limit_usage_to_x_items: null,
      product_ids: [], excluded_product_ids: [], product_categories: [], excluded_product_categories: [], exclude_sale_items: false }]]),
    couponIds: new Map([['ten', '303']]), productCategories: new Map(), calcDiscountsSequentially: false,
  } });
  builder.addLine({ productId: '1', name: 'Item', unitPrice: { amount: 800, currency: 'USD' }, regularUnitPriceMinor: 1000 });
  builder.addFee({ name: 'Bag', amountMinor: 20 });
  builder.addShipping({ name: 'Delivery', amountMinor: 300, taxClass: 'standard', methodId: 'flat_rate' });
  if (coupons) builder.setCoupons(['ten']);
  builder.setCustomer(customer);
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  if (note) builder.setNote(note);
  let nextId = 0;
  return finalizeOrder(builder.getSnapshot(), {
    now: new Date('2026-11-11T10:00:00.000Z'), newId: () => `019f6d2e-7800-7000-8000-${String(++nextId).padStart(12, '0')}`,
    capabilities: { orderCreate: 8 }, registerId: 'register_golden', cashierRef: 'cashier_golden',
    ...(taxLocation ? { taxLocation } : {}),
  });
}
const envelope = (order = sale(), maxVersion = 8) => toOrderCreateEnvelope(order, 'device_golden', 1, { maxVersion });

describe('order.create v8, a sale taxed on the customer\'s address (#722)', () => {
  it('matches the golden file byte for byte with the tax address and both addresses', () => {
    const sent = envelope();
    expect(JSON.stringify(sent, null, 2) + '\n').toBe(readFileSync(fixturePath, 'utf8'));
    expect(sent.version).toBe(8);
    expect(sent.payload.taxAddress).toBe('billing');
    expect(sent.payload.customer).toStrictEqual({ email: 'ann@example.com', customerId: '42',
      billing: { firstName: 'Ann', lastName: 'Lee', address1: '1 Main St', city: 'Albany', state: 'NY', postcode: '12207', country: 'US', phone: '555-0100' },
      shipping: { firstName: 'Ann', city: 'Portland', state: 'OR', postcode: '97201', country: 'US' } });
    expect(precheckCommand(sent, supported)).toBeUndefined();
    expect(payloadShapeErrors(sent.payload)).toEqual([]);
    expect(payloadBoundErrors(sent.payload)).toEqual([]);
  });

  it.each([7, 6, 5])('never downgrades: a cap of %s throws UnsupportedOrderVersionError(8, cap)', (cap) => {
    let thrown: unknown;
    try { envelope(sale(), cap); } catch (cause) { thrown = cause; }
    expect(thrown).toBeInstanceOf(UnsupportedOrderVersionError);
    expect(thrown).toMatchObject({ needed: 8, supported: cap });
    expect(() => toOrderCreateEnvelope({ ...sale(), sentVersion: 7 }, 'device_golden')).toThrow(UnsupportedOrderVersionError);
  });

  it('is sent at 8 by the outbox when the server advertises 7, so the server refuses rather than taxing on the base', async () => {
    const db = await createRxDatabase({ name: `v8outbox${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    try {
      const { pos_orders: collection } = await db.addCollections({ pos_orders: posOrderCollection() });
      const order = sale();
      await collection.insert(order);
      const send = vi.fn<CommandTransport<OrderCreateEnvelope>['send']>(async (batch) => ({ kind: 'results',
        results: batch.map((command): CommandResult => ({ id: command.id, status: 'applied', serverRefs: { orderId: 'server-1', totalMinor: command.payload.totalMinor } })) }));
      const outbox = createOrderOutbox({ collection, transport: { send }, deviceId: 'device_golden', random: () => 0.5,
        getMaxOrderCreateVersion: () => 7 });
      await outbox.flush();
      outbox.stop();
      expect(send).toHaveBeenCalledTimes(1);
      const [sent] = send.mock.calls[0][0];
      expect(sent.version).toBe(8);
      expect(sent.payload.taxAddress).toBe('billing');
      expect(JSON.stringify(sent.payload)).toBe(JSON.stringify(envelope(order).payload));
      expect((await collection.findOne(order.id).exec())!.sentVersion).toBe(8);
    } finally {
      await db.remove();
    }
  });

  it.each([[false, 5], [true, 6]] as const)('keeps a base-taxed order (coupons: %s) byte-identical at cap 8 and at its own version', (coupons, own) => {
    const order = sale({ coupons, taxLocation: baseLocation }), noLocation = sale({ coupons, taxLocation: null });
    expect(order).not.toHaveProperty('taxAddress');
    expect(order.customer).toStrictEqual({ id: '42', name: 'Ann Lee', email: 'ann@example.com' });
    // saleId is the builder's own, so it differs between two sales.
    expect(JSON.stringify({ ...order, saleId: '' })).toBe(JSON.stringify({ ...noLocation, saleId: '' }));
    const at8 = JSON.stringify(envelope(order, 8));
    expect(envelope(order, 8).version).toBe(own);
    expect(at8).toBe(JSON.stringify(envelope(order, own)));
    expect(at8).toBe(JSON.stringify(envelope(order, 7)));
    expect(at8).not.toContain('taxAddress');
    expect(at8).not.toContain('"billing"');
  });

  it('keeps a base-taxed sale with a note at 7, byte for byte as at cap 7', () => {
    const order = sale({ note: 'Gift wrap', taxLocation: baseLocation });
    expect(envelope(order, 8).version).toBe(7);
    expect(JSON.stringify(envelope(order, 8))).toBe(JSON.stringify(envelope(order, 7)));
  });

  it('carries the note on a v8 sale, changing no other field', () => {
    const withNote = envelope(sale({ note: 'Gift wrap' })), without = envelope(sale());
    expect(withNote.version).toBe(8);
    expect(withNote.payload.note).toBe('Gift wrap');
    const { note: _note, ...payload } = withNote.payload;
    expect(JSON.stringify(payload)).toBe(JSON.stringify(without.payload));
  });

  it('pins the tax address version and the golden version to 8', () => {
    expect(TAX_ADDRESS_ORDER_CREATE_VERSION).toBe(8);
    expect(JSON.parse(readFileSync(fixturePath, 'utf8')).version).toBe(8);
  });
});

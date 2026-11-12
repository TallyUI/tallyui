// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { CommandResult, OrderCreateEnvelope } from '@tallyui/core';
import { payloadBoundErrors, payloadShapeErrors, precheckCommand } from '@tallyui/core/server';
import { couponPricingBasis, createOrderBuilder } from '../order/order-builder';
import { createOrderOutbox } from '../outbox/order-outbox';
import type { CommandTransport } from '../outbox/types';
import { ORDER_CREATE_MAX_VERSION, toOrderCreateEnvelope } from './command';
import { finalizeOrder } from './finalize';
import { posOrderCollection } from './schema';
import type { PosOrder } from './types';

const fixturePath = fileURLToPath(new URL('./__fixtures__/order-create-v9.json', import.meta.url));
const supported = { orderCreate: [1, 2, 3, 4, 5, 6, 7, 8, 9], register: [1] };
const addresses = { billing: { city: 'Albany', state: 'NY', postcode: '12207', country: 'US' }, shipping: { city: 'Portland', state: 'OR', country: 'US' } };
function sale({ note = '', taxed = false, woo = false } = {}) {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: {
    pricesIncludeTax: true, getTaxRatePpm: () => 190000,
    rounding: woo ? { granularity: 'woocommerce', roundAtSubtotal: false } : { granularity: 'per_order', mode: 'half_away_from_zero' },
    getTaxRates: () => [{ id: 1, code: 'VAT', label: 'VAT', rate: '19.0000', priority: 1, compound: false, shipping: true }],
  }, couponContext: woo ? {
    configs: new Map([['c', { discount_type: 'percent', amount: '10', limit_usage_to_x_items: null,
      product_ids: [], excluded_product_ids: [], product_categories: [], excluded_product_categories: [], exclude_sale_items: false }]]),
    couponIds: new Map([['c', '303']]), productCategories: new Map(), calcDiscountsSequentially: false,
  } : undefined });
  const lineId = builder.addLine({ productId: 'p', name: 'p', unitPrice: { amount: 1190, currency: 'EUR' } });
  builder.applyLineDiscount(lineId, { type: 'percentage', value: 10 });
  if (taxed) builder.setCustomer({ id: '42', name: 'Ann Lee', email: 'ann@example.com', ...addresses });
  if (note) builder.setNote(note);
  if (woo) builder.setCoupons(['c']);
  else builder.setCoupons(['c'], { kind: 'store-priced', basis: couponPricingBasis(builder.getSnapshot()),
    priced: new Map([['c', { couponId: 'promo_1', lines: [{ lineId, amountMinor: 100 }] }]]) });
  builder.addPayment({ method: 'cash', amountMinor: woo ? builder.getSnapshot().totalMinor : 971 });
  let nextId = 0;
  const order = finalizeOrder(builder.getSnapshot(), {
    now: new Date('2026-11-12T10:00:00.000Z'), newId: () => `019f6d2e-7800-7000-8000-${String(++nextId).padStart(12, '0')}`,
    capabilities: { orderCreate: 9 }, ...(taxed ? { taxLocation: { taxBasedOn: 'billing', addressUsed: 'billing', location: addresses.billing } as const } : {}),
  });
  order.display!.lines[0].discounts[0].discountId = 'discount_line';
  return order;
}
const envelope = (order = sale(), maxVersion = 9) => toOrderCreateEnvelope(order, 'device_golden', 1, { maxVersion });
const withoutLines = (order: PosOrder): PosOrder => ({ ...order, coupons: order.coupons!.map(({ lines: _lines, ...coupon }) => coupon) });

describe('order.create v9 store-priced coupon lines (#790)', () => {
  it('matches the golden file byte for byte with the worked example figures', () => {
    const sent = envelope();
    expect(JSON.stringify(sent, null, 2) + '\n').toBe(readFileSync(fixturePath, 'utf8'));
    expect(sent.version).toBe(9);
    expect(sent.payload.coupons![0]).toStrictEqual({ code: 'c', couponId: 'promo_1', discountMinor: 84, discountTaxMinor: 16,
      lines: [{ clientLineId: sent.payload.lines[0].clientLineId, discountMinor: 84, discountTaxMinor: 16 }] });
    expect(sent.payload).toMatchObject({ subtotalMinor: 816, taxMinor: 155, totalMinor: 971 });
  });

  it('passes the server precheck, shape and bounds checks', () => {
    const sent = envelope();
    expect(precheckCommand(sent, supported)).toBeUndefined();
    expect(payloadShapeErrors(sent.payload)).toEqual([]);
    expect(payloadBoundErrors(sent.payload)).toEqual([]);
  });

  it.each([8, 7, 6])('keeps today’s bytes with no coupon lines at cap %s', (cap) => {
    const order = sale(), sent = envelope(order, cap);
    expect(JSON.stringify(sent)).toBe(JSON.stringify(envelope(withoutLines(order), cap)));
    expect(JSON.stringify(sent.payload.coupons)).not.toContain('"lines"');
    expect(envelope(withoutLines(order)).version).not.toBe(9);
    expect(toOrderCreateEnvelope(order, 'device_golden').version).not.toBe(9);
    expect(envelope({ ...order, sentVersion: cap as 6 | 7 | 8 }).version).not.toBe(9);
  });

  it('carries a note at 9 and addresses only when the sale has a tax address', () => {
    const order = sale({ note: 'Gift wrap' }), sent = envelope({ ...order, customer: { name: 'Ann', ...addresses } });
    expect(sent.version).toBe(9);
    expect(sent.payload.note).toBe('Gift wrap');
    expect(sent.payload).not.toHaveProperty('taxAddress');
    expect(sent.payload.customer).toBeNull();
    expect(envelope({ ...order, customer: { name: 'Ann', email: 'ann@example.com', ...addresses } }).payload.customer)
      .toStrictEqual({ email: 'ann@example.com' });
    const taxed = sale({ taxed: true, note: 'Gift wrap' }), at9 = envelope(taxed);
    expect(at9.version).toBe(9);
    expect(at9.payload).toMatchObject({ taxAddress: 'billing', note: 'Gift wrap', customer: addresses });
    expect(precheckCommand(at9, supported)).toBeUndefined();
    expect(envelope(taxed, 8).version).toBe(8);
    expect(JSON.stringify(envelope(taxed, 8))).toBe(JSON.stringify(envelope(withoutLines(taxed), 8)));
  });

  it('keeps a WooCommerce replay coupon at today’s version and bytes', () => {
    const order = sale({ woo: true });
    expect(order.coupons![0]).not.toHaveProperty('lines');
    expect(envelope(order).version).not.toBe(9);
    expect(JSON.stringify(envelope(order))).toBe(JSON.stringify(envelope(order, 8)));
  });

  it('resends at 8 after unsupported_version and keeps the stored coupon lines', async () => {
    const db = await createRxDatabase({ name: `v9outbox${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }) });
    try {
      const { pos_orders: collection } = await db.addCollections({ pos_orders: posOrderCollection() });
      const order = sale({ taxed: true });
      await collection.insert(order);
      const send = vi.fn<CommandTransport<OrderCreateEnvelope>['send']>(async (batch) => ({ kind: 'results',
        results: batch.map((command): CommandResult => command.version === 9
          ? { id: command.id, status: 'rejected', error: { code: 'unsupported_version', message: 'Maximum 8', data: { orderCreate: 8 } } }
          : { id: command.id, status: 'applied', serverRefs: { orderId: 'server-1', totalMinor: command.payload.totalMinor } }) }));
      const outbox = createOrderOutbox({ collection, transport: { send }, deviceId: 'device_golden', random: () => 0.5, getMaxOrderCreateVersion: () => 9 });
      try { await outbox.flush(); } finally { outbox.stop(); }
      expect(send.mock.calls.map(([batch]) => batch[0].version)).toEqual([9, 8]);
      expect(JSON.stringify(send.mock.calls[1][0][0].payload)).toBe(JSON.stringify(envelope(withoutLines(order), 8).payload));
      const stored = (await collection.findOne(order.id).exec())!.toJSON();
      expect(stored).toMatchObject({ syncStatus: 'applied', sentVersion: 8, downgradedFrom: 9 });
      expect(stored.coupons).toStrictEqual(order.coupons);
    } finally { await db.remove(); }
  });

  it('pins the stored maxima and golden version to the till maximum of 9', () => {
    const { properties } = posOrderCollection().schema;
    expect(ORDER_CREATE_MAX_VERSION).toBe(9);
    expect(properties.sentVersion.maximum).toBe(ORDER_CREATE_MAX_VERSION);
    expect(properties.downgradedFrom.maximum).toBe(ORDER_CREATE_MAX_VERSION);
    expect(JSON.parse(readFileSync(fixturePath, 'utf8')).version).toBe(ORDER_CREATE_MAX_VERSION);
  });
});

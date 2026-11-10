// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ORDER_NOTE_MAX } from '@tallyui/core';
import { payloadBoundErrors, precheckCommand } from '@tallyui/core/server';
import { createOrderBuilder } from '../order/order-builder';
import { ORDER_CREATE_MAX_VERSION, toOrderCreateEnvelope } from './command';
import { finalizeOrder, freezeSentForm } from './finalize';
import { posOrderCollection } from './schema';

const fixturePath = fileURLToPath(new URL('./__fixtures__/order-create-v7.json', import.meta.url));
const supported = { orderCreate: [1, 2, 3, 4, 5, 6, 7], register: [1] };
function sale(coupons = true, fee = false, shipping = false, note = 'Gift wrap, please') {
  const builder = createOrderBuilder({ currency: 'GBP', taxContext: {
    pricesIncludeTax: false, rounding: { granularity: 'woocommerce', roundAtSubtotal: false }, getTaxRatePpm: () => 200000,
    getTaxRates: () => [{ id: 1, code: 'VAT', label: 'VAT', rate: '20.0000', priority: 1, compound: false, shipping: true }],
  }, couponContext: {
    configs: new Map([['ten', { discount_type: 'percent', amount: '10', limit_usage_to_x_items: null,
      product_ids: [], excluded_product_ids: [], product_categories: [], excluded_product_categories: [], exclude_sale_items: false }]]),
    couponIds: new Map([['ten', '303']]), productCategories: new Map(), calcDiscountsSequentially: false,
  } });
  builder.addLine({ productId: '1', name: 'Item', unitPrice: { amount: 800, currency: 'GBP' }, regularUnitPriceMinor: 1000 });
  builder.addLine({ productId: '2', name: 'Item 2', unitPrice: { amount: 500, currency: 'GBP' }, regularUnitPriceMinor: 500 });
  if (coupons) builder.setCoupons(['ten']);
  if (fee) builder.addFee({ name: 'Bag', amountMinor: 20 });
  if (shipping) builder.addShipping({ name: 'Delivery', amountMinor: 30, taxClass: 'standard', methodId: 'flat_rate' });
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  builder.setNote(note);
  let nextId = 0;
  const order = finalizeOrder(builder.getSnapshot(), {
    now: new Date('2026-10-07T10:00:00.000Z'), newId: () => `019f6d2e-7800-7000-8000-${String(++nextId).padStart(12, '0')}`,
    capabilities: { orderCreate: 6 }, registerId: 'register_golden', cashierRef: 'cashier_golden',
  });
  order.lines[0].attributes = { Size: 'L', Colour: 'Red' };
  return order;
}

describe('order.create v7 sale note (ADR-083)', () => {
  it('matches the golden file byte for byte with the note and coupons', () => {
    const envelope = toOrderCreateEnvelope(sale(), 'device_golden', 1, { maxVersion: 7 });
    expect(JSON.stringify(envelope, null, 2) + '\n').toBe(readFileSync(fixturePath, 'utf8'));
    expect(envelope.version).toBe(7);
    expect(envelope.payload.note).toBe('Gift wrap, please');
    expect(envelope.payload.coupons).toEqual([{ code: 'ten', couponId: '303', discountMinor: 130, discountTaxMinor: 26 }]);
  });

  it('keeps the version-6 coupon envelope bytes unchanged with a note', () => {
    const order = sale(), withoutNote = { ...order };
    delete withoutNote.note;
    const envelope = toOrderCreateEnvelope(order, 'device_golden', 1, { maxVersion: 6 });
    expect(JSON.stringify(envelope)).toBe(JSON.stringify(toOrderCreateEnvelope(withoutNote, 'device_golden', 1, { maxVersion: 6 })));
    expect(envelope.version).toBe(6);
    expect(JSON.stringify(envelope)).not.toContain('"note"');
  });

  it.each([3, 4, 5, 6])('keeps coupon-free envelope bytes unchanged with a note capped at %s', (cap) => {
    const order = sale(false), withoutNote = { ...order };
    delete withoutNote.note;
    const envelope = toOrderCreateEnvelope(order, 'device_golden', 1, { maxVersion: cap });
    expect(JSON.stringify(envelope)).toBe(JSON.stringify(toOrderCreateEnvelope(withoutNote, 'device_golden', 1, { maxVersion: cap })));
    expect(JSON.stringify(envelope)).not.toContain('"note"');
  });

  it('changes no other payload field for a coupon-free sale at version 7', () => {
    const order = sale(false), withoutNote = { ...order };
    delete withoutNote.note;
    const envelope = toOrderCreateEnvelope(order, 'device_golden', 1, { maxVersion: 7 });
    const prior = toOrderCreateEnvelope(withoutNote, 'device_golden', 1, { maxVersion: 7 });
    expect(envelope.version).toBe(7);
    expect(envelope.payload.note).toBe('Gift wrap, please');
    expect(prior.version).toBe(4);
    const { note: _note, ...payload } = envelope.payload;
    expect(JSON.stringify(payload)).toBe(JSON.stringify(prior.payload));
  });

  it('keeps an order without a note byte-identical at caps 7 and 6', () => {
    const order = sale(true, false, false, '');
    expect(JSON.stringify(toOrderCreateEnvelope(order, 'device_golden', 1, { maxVersion: 7 })))
      .toBe(JSON.stringify(toOrderCreateEnvelope(order, 'device_golden', 1, { maxVersion: 6 })));
  });

  it('resends version 7 without options and respects a stored version 6 cap', () => {
    const order = sale(), envelope = toOrderCreateEnvelope(order, 'device_golden', 1, { maxVersion: 7 });
    const resend = toOrderCreateEnvelope({ ...order, sentVersion: 7 }, 'device_golden');
    expect(resend.version).toBe(7);
    expect(JSON.stringify(resend.payload)).toBe(JSON.stringify(envelope.payload));
    const capped = toOrderCreateEnvelope({ ...order, sentVersion: 6 }, 'device_golden', 1, { maxVersion: 7 });
    expect(capped.version).toBe(6);
    expect(capped.payload).not.toHaveProperty('note');
  });

  it('does not send version 7 or the note without figures', () => {
    const builder = createOrderBuilder({ currency: 'GBP', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 200000 } });
    builder.addLine({ productId: '1', name: 'Shirt', unitPrice: { amount: 800, currency: 'GBP' } });
    builder.addPayment({ method: 'cash', amountMinor: 5000 });
    builder.setNote('Gift wrap');
    const order = finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 2 } });
    expect(order.display).toBeUndefined();
    const envelope = toOrderCreateEnvelope(order, 'device_golden', 1, { maxVersion: 7 });
    expect(envelope.version).not.toBe(7);
    expect(envelope.payload).not.toHaveProperty('note');
  });

  it('passes the server precheck for the golden envelope', () => {
    expect(precheckCommand(toOrderCreateEnvelope(sale(), 'device_golden', 1, { maxVersion: 7 }), supported)).toBeUndefined();
  });

  it('freezes a long note at ORDER_NOTE_MAX units and is idempotent', () => {
    const order = freezeSentForm({ ...sale(), note: 'x'.repeat(ORDER_NOTE_MAX + 1) });
    expect(order.note).toBe('x'.repeat(ORDER_NOTE_MAX - 1) + '…');
    expect(order.note).toHaveLength(ORDER_NOTE_MAX);
    expect(payloadBoundErrors(toOrderCreateEnvelope(order, 'device_golden', 1, { maxVersion: 7 }).payload)).toEqual([]);
    expect(freezeSentForm(order)).toBe(order);
  });

  it('pins both stored version maxima and the golden version to the till maximum', () => {
    const { properties } = posOrderCollection().schema;
    expect(properties.sentVersion.maximum).toBe(ORDER_CREATE_MAX_VERSION);
    expect(properties.downgradedFrom.maximum).toBe(ORDER_CREATE_MAX_VERSION);
    expect(JSON.parse(readFileSync(fixturePath, 'utf8')).version).toBe(ORDER_CREATE_MAX_VERSION);
  });
});

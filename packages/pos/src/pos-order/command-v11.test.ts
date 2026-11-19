// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CustomerAddress } from '@tallyui/core';
import { payloadBoundErrors, payloadShapeErrors, precheckCommand } from '@tallyui/core/server';
import { couponPricingBasis, createOrderBuilder } from '../order/order-builder';
import { ORDER_CREATE_MAX_VERSION, toOrderCreateEnvelope, toOrderUpdateEnvelope, UNTAXED_ADDRESS_ORDER_CREATE_VERSION } from './command';
import { finalizeOrder } from './finalize';
import { posOrderCollection } from './schema';
import type { PosOrder } from './types';

const fixturePath = fileURLToPath(new URL('./__fixtures__/order-create-v11.json', import.meta.url));
const supported = { orderCreate: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], register: [1], orderUpdate: [1] };
const billing: CustomerAddress = { firstName: 'Ann', lastName: 'Lee', company: '', address1: '1 State St', city: 'Albany', state: 'NY',
  postcode: '12207', country: 'US', phone: '+1 518 555 0100', email: 'ann@example.com' };
const shipping: CustomerAddress = { firstName: 'Ann', lastName: 'Lee', address1: '9 River Rd', city: 'Troy', state: 'NY', postcode: '12180', country: 'US' };
type Coupon = 'none' | 'store' | 'woo';

/** A finalized cash sale with figures, its customer picked with billing and shipping, and no tax address unless `taxed`. */
function sale({ addresses = { billing, shipping } as { billing?: CustomerAddress; shipping?: CustomerAddress }, taxed = false,
  coupon = 'none' as Coupon, methodId = undefined as string | undefined, note = '' } = {}) {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: {
    pricesIncludeTax: true, getTaxRatePpm: () => 190000, rounding: coupon === 'woo' ? { granularity: 'woocommerce', roundAtSubtotal: false }
      : { granularity: 'per_order', mode: 'half_away_from_zero' },
    getTaxRates: () => [{ id: 1, code: 'VAT', label: 'VAT', rate: '19.0000', priority: 1, compound: false, shipping: true }],
  }, couponContext: coupon === 'woo' ? {
    configs: new Map([['c', { discount_type: 'percent', amount: '10', limit_usage_to_x_items: null,
      product_ids: [], excluded_product_ids: [], product_categories: [], excluded_product_categories: [], exclude_sale_items: false }]]),
    couponIds: new Map([['c', '303']]), productCategories: new Map(), calcDiscountsSequentially: false,
  } : undefined });
  const lineId = builder.addLine({ productId: 'p', name: 'p', unitPrice: { amount: 1190, currency: 'EUR' } });
  builder.applyLineDiscount(lineId, { type: 'percentage', value: 10 });
  builder.setCustomer({ id: '42', name: 'Ann Lee', email: 'ann@example.com', ...addresses });
  if (note) builder.setNote(note);
  if (coupon === 'woo') builder.setCoupons(['c']);
  if (coupon === 'store') builder.setCoupons(['c'], { kind: 'store-priced', basis: couponPricingBasis(builder.getSnapshot()),
    priced: new Map([['c', { couponId: 'promo_1', lines: [{ lineId, amountMinor: 100 }] }]]) });
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor, ...(methodId ? { methodId } : {}) });
  let nextId = 0;
  const order = finalizeOrder(builder.getSnapshot(), {
    now: new Date('2026-11-19T10:00:00.000Z'), newId: () => `019f8f66-7800-7000-8000-${String(++nextId).padStart(12, '0')}`,
    capabilities: { orderCreate: 11 },
    ...(taxed ? { taxLocation: { taxBasedOn: 'billing', addressUsed: 'billing', location: { country: 'US', state: 'NY', city: 'Albany', postcode: '12207' } } as const } : {}),
  });
  if (order.display!.lines[0].discounts[0]) order.display!.lines[0].discounts[0].discountId = 'discount_line';
  return order;
}
const envelope = (order: PosOrder, maxVersion: number) => toOrderCreateEnvelope(order, 'device_golden', 1, { maxVersion });
/** The same order with its customer's stored addresses taken out: ids and email unchanged. */
const withoutAddresses = (order: PosOrder): PosOrder => {
  const { billing: _billing, shipping: _shipping, ...customer } = order.customer!;
  return { ...order, customer };
};

describe('order.create v11: the customer\'s addresses on a sale not taxed by address (ADR-086 d2, amended 2026-11-19)', () => {
  it('V1 matches the golden file byte for byte: version 11, billing and shipping, no taxAddress; it passes the server checks', () => {
    const order = sale(), sent = envelope(order, 11);
    expect(order.taxAddress).toBeUndefined();
    expect(sent.version).toBe(11);
    expect(sent.payload.customer).toStrictEqual({ email: 'ann@example.com', customerId: '42',
      billing: { firstName: 'Ann', lastName: 'Lee', address1: '1 State St', city: 'Albany', state: 'NY', postcode: '12207', country: 'US', phone: '+1 518 555 0100' },
      shipping: { firstName: 'Ann', lastName: 'Lee', address1: '9 River Rd', city: 'Troy', state: 'NY', postcode: '12180', country: 'US' } });
    expect(sent.payload).not.toHaveProperty('taxAddress');
    expect(JSON.stringify(sent, null, 2) + '\n').toBe(readFileSync(fixturePath, 'utf8'));
    expect(precheckCommand(sent, supported)).toBeUndefined();
    expect(payloadShapeErrors(sent.payload)).toEqual([]);
    expect(payloadBoundErrors(sent.payload)).toEqual([]);
  });

  it('pins the stored maxima and golden version to the till maximum of 11', () => {
    const { properties } = posOrderCollection().schema;
    expect(ORDER_CREATE_MAX_VERSION).toBe(11);
    expect(UNTAXED_ADDRESS_ORDER_CREATE_VERSION).toBe(ORDER_CREATE_MAX_VERSION);
    expect(properties.sentVersion.maximum).toBe(ORDER_CREATE_MAX_VERSION);
    expect(properties.downgradedFrom.maximum).toBe(ORDER_CREATE_MAX_VERSION);
    expect(JSON.parse(readFileSync(fixturePath, 'utf8')).version).toBe(ORDER_CREATE_MAX_VERSION);
  });

  it.each([[4, 4, 4], [8, 4, 7], [9, 4, 7], [10, 4, 10]])('V2 at cap %i sends a sale with addresses byte-identical to one without (v8-only backend and cap 4): version %i, %i with a note and a methodId',
    (cap, plain, noted) => {
      for (const [order, version] of [[sale(), plain], [sale({ note: 'Gift wrap', methodId: 'cod' }), noted]] as const) {
        const sent = envelope(order, cap);
        expect(sent.version).toBe(version);
        expect(sent).toStrictEqual(envelope(withoutAddresses(order), cap));
        expect(JSON.stringify(sent)).not.toMatch(/billing|shipping/);
      }
    });

  it('V3 sends a sale with no address at cap 11 exactly as at cap 10', () => {
    for (const order of [withoutAddresses(sale()), sale({ addresses: {} }), withoutAddresses(sale({ note: 'Gift wrap', methodId: 'cod' }))]) {
      expect(order.customer).not.toHaveProperty('billing');
      expect(envelope(order, 11)).toStrictEqual(envelope(order, 10));
    }
  });

  it('V4 sends a sale taxed on the billing address at cap 11 exactly as at cap 10, with taxAddress', () => {
    const order = sale({ taxed: true }), sent = envelope(order, 11);
    expect(order.taxAddress).toBe('billing');
    expect(sent).toStrictEqual(envelope(order, 10));
    expect(sent.version).toBe(8);
    expect(sent.payload).toMatchObject({ taxAddress: 'billing', customer: { billing: { country: 'US' }, shipping: { country: 'US' } } });
  });

  it("V5 sends a figureless sale and a sale whose coupons have no lines at cap 11 as today, without the addresses (10's requirements)", () => {
    const { display: _display, taxByRate: _taxByRate, ...figureless } = sale();
    expect(envelope(figureless, 11).version).toBe(2);
    expect(envelope(figureless, 11)).toStrictEqual(envelope(withoutAddresses(figureless), 11));
    const woo = sale({ coupon: 'woo' });
    expect(woo.coupons![0]).not.toHaveProperty('lines');
    const sent = envelope(woo, 11);
    expect(sent.version).toBe(6);
    expect(sent).toStrictEqual(envelope(withoutAddresses(woo), 11));
    expect(sent).toStrictEqual(envelope(woo, 10));
    expect(JSON.stringify(sent)).not.toMatch(/billing/);
  });

  it('V6 sends a customer with only a shipping address at 11, with customer.shipping and no billing', () => {
    const sent = envelope(sale({ addresses: { shipping } }), 11);
    expect(sent.version).toBe(11);
    expect(sent.payload.customer).toHaveProperty('shipping.city', 'Troy');
    expect(sent.payload.customer).not.toHaveProperty('billing');
    expect(precheckCommand(sent, supported)).toBeUndefined();
  });

  it("V7 carries 10's methodId and 9's coupon lines on a lifted sale", () => {
    const sent = envelope(sale({ coupon: 'store', methodId: 'cod', note: 'Gift wrap' }), 11);
    expect(sent.version).toBe(11);
    expect(sent.payload.payments[0].methodId).toBe('cod');
    expect(sent.payload.coupons![0].lines).toHaveLength(1);
    expect(sent.payload).toMatchObject({ note: 'Gift wrap', customer: { billing: { city: 'Albany' }, shipping: { city: 'Troy' } } });
    expect(precheckCommand(sent, supported)).toBeUndefined();
  });

  it('V8 never lifts an order whose earlier attempt went out at 10: today\'s version, no addresses', () => {
    const order: PosOrder = { ...sale({ coupon: 'store', methodId: 'cod' }), sentVersion: 10 };
    const sent = envelope(order, 11);
    expect(sent.version).toBe(10);
    expect(sent).toStrictEqual(envelope(withoutAddresses(order), 10));
  });

  it('V9 order.update reuses the create path: at cap 10 a reopened sale goes as today without addresses; at cap 11 it goes at createVersion 11 with them', () => {
    const order = sale();
    const reopened: PosOrder = { ...order, storeOrderId: '4711',
      baseRevision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298',
      payments: [{ ...order.payments[0], storePaymentId: '21' }] };
    const update = (row: PosOrder, maxVersion: number) => toOrderUpdateEnvelope(row, 'device_golden', 1, { maxVersion });
    const at10 = update(reopened, 10);
    expect(at10.payload.createVersion).toBe(5);
    expect(at10).toStrictEqual(update(withoutAddresses(reopened), 10));
    expect(JSON.stringify(at10)).not.toMatch(/billing|shipping/);
    const at11 = update(reopened, 11);
    expect(at11.payload.createVersion).toBe(11);
    expect(at11.payload.customer).toMatchObject({ billing: { city: 'Albany' }, shipping: { city: 'Troy' } });
    expect(at11.payload).not.toHaveProperty('taxAddress');
    expect(precheckCommand(at11, supported)).toBeUndefined();
  });
});

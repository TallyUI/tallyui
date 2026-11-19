// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { OrderCreateEnvelope } from '@tallyui/core';
import { payloadBoundErrors, payloadShapeErrors, precheckCommand } from '@tallyui/core/server';
import { couponPricingBasis, createOrderBuilder } from '../order/order-builder';
import { PAYMENT_METHOD_ID_ORDER_CREATE_VERSION, toOrderCreateEnvelope, toOrderUpdateEnvelope } from './command';
import { finalizeOrder } from './finalize';
import type { PosOrder } from './types';

const fixturePath = fileURLToPath(new URL('./__fixtures__/order-create-v10.json', import.meta.url));
const supported = { orderCreate: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], register: [1] };
const addresses = { billing: { city: 'Albany', state: 'NY', postcode: '12207', country: 'US' } };
/** command-v9's sale, paid by a card leg and a cash leg that each carry the payment method's own id. */
function sale({ note = '', taxed = false, woo = false, ids = true } = {}) {
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
  builder.addPayment({ method: 'external', amountMinor: 500, reference: 'T-1', ...(ids ? { methodId: 'stripe_terminal_for_woocommerce' } : {}) });
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor - 400, ...(ids ? { methodId: 'cod' } : {}) });
  let nextId = 0;
  const order = finalizeOrder(builder.getSnapshot(), {
    now: new Date('2026-11-18T10:00:00.000Z'), newId: () => `019f8a40-7800-7000-8000-${String(++nextId).padStart(12, '0')}`,
    capabilities: { orderCreate: 10 }, ...(taxed ? { taxLocation: { taxBasedOn: 'billing', addressUsed: 'billing', location: addresses.billing } as const } : {}),
  });
  order.display!.lines[0].discounts[0].discountId = 'discount_line';
  return order;
}
const envelope = (order = sale(), maxVersion = 10) => toOrderCreateEnvelope(order, 'device_golden', 1, { maxVersion });
const withoutIds = (order: PosOrder): PosOrder => ({ ...order, payments: order.payments.map(({ methodId: _id, ...payment }) => payment) });
/** A version-10 envelope as 9 would carry it: the version set back and every payment's methodId taken out. */
const asNine = (sent: OrderCreateEnvelope) => ({ ...sent, version: 9,
  payload: { ...sent.payload, payments: sent.payload.payments.map(({ methodId: _id, ...payment }) => payment) } });

describe('order.create v10 payment method ids (ruling A, 2026-11-18)', () => {
  it('matches the golden file byte for byte, and passes the server precheck, shape and bounds checks', () => {
    const sent = envelope();
    expect(JSON.stringify(sent, null, 2) + '\n').toBe(readFileSync(fixturePath, 'utf8'));
    expect(sent.version).toBe(10);
    expect(sent.payload.payments.map((payment) => [payment.method, payment.methodId]))
      .toEqual([['external', 'stripe_terminal_for_woocommerce'], ['cash', 'cod']]);
    expect(precheckCommand(sent, supported)).toBeUndefined();
    expect(payloadShapeErrors(sent.payload)).toEqual([]);
    expect(payloadBoundErrors(sent.payload)).toEqual([]);
  });

  it('keeps its golden at version 10 (the till maximum is pinned in command-v11.test.ts)', () => {
    expect(PAYMENT_METHOD_ID_ORDER_CREATE_VERSION).toBe(10);
    expect(JSON.parse(readFileSync(fixturePath, 'utf8')).version).toBe(10);
  });

  it('keeps the note, a tax address and the coupon lines exactly as 9 does', () => {
    const taxed = sale({ taxed: true, note: 'Gift wrap' }), at10 = envelope(taxed);
    expect(at10.version).toBe(10);
    expect(at10.payload).toMatchObject({ taxAddress: 'billing', note: 'Gift wrap', customer: addresses });
    expect(at10.payload.coupons![0].lines).toHaveLength(1);
    expect(JSON.stringify(asNine(at10))).toBe(JSON.stringify(envelope(taxed, 9)));
    expect(precheckCommand(at10, supported)).toBeUndefined();
  });

  it.each([10, 11])('sends an order with no methodId at cap %i byte-identical to cap 9', (cap) => {
    for (const order of [sale({ ids: false }), sale({ ids: false, taxed: true, note: 'Gift wrap' })]) {
      expect(JSON.stringify(envelope(order, cap))).toBe(JSON.stringify(envelope(order, 9)));
    }
  });

  it.each([9, 8, 7, 6])('sends nothing new at cap %i: the ids stay off the wire', (cap) => {
    const order = sale({ note: 'Gift wrap' });
    expect(JSON.stringify(envelope(order, cap))).toBe(JSON.stringify(envelope(withoutIds(order), cap)));
    expect(JSON.stringify(toOrderCreateEnvelope(order, 'device_golden'))).not.toContain('methodId');
  });

  it("sends an order whose coupons lack lines at today's version, without its ids", () => {
    const order = sale({ woo: true });
    expect(order.coupons![0]).not.toHaveProperty('lines');
    expect(envelope(order).version).not.toBe(10);
    expect(JSON.stringify(envelope(order))).toBe(JSON.stringify(envelope(withoutIds(order))));
  });

  it('sends an order with no figures as today, without its ids', () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 100, currency: 'EUR' } });
    builder.addPayment({ method: 'cash', amountMinor: 100, methodId: 'cod' });
    const { display: _display, taxByRate: _taxByRate, ...bare } = finalizeOrder(builder.getSnapshot());
    expect(bare.payments[0].methodId).toBe('cod');
    expect(envelope(bare).version).toBe(1);
    expect(JSON.stringify(envelope(bare))).toBe(JSON.stringify(envelope(withoutIds(bare))));
  });

  it('order.update at cap 10 carries createVersion 10 and each payment\'s methodId beside its paymentId', () => {
    const order = sale();
    const reopened: PosOrder = { ...order, storeOrderId: '4711',
      baseRevision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298',
      payments: [{ ...order.payments[0], storePaymentId: '21' }, order.payments[1]] };
    const update = toOrderUpdateEnvelope(reopened, 'device_golden', 1, { maxVersion: 10 });
    expect(update.payload.createVersion).toBe(10);
    expect(update.payload.payments.map((payment) => [payment.clientPaymentId, payment.methodId, payment.paymentId])).toEqual([
      [order.payments[0].id, 'stripe_terminal_for_woocommerce', '21'], [order.payments[1].id, 'cod', undefined]]);
    const at9 = toOrderUpdateEnvelope(reopened, 'device_golden', 1, { maxVersion: 9 });
    expect(at9.payload.createVersion).toBe(9);
    expect(JSON.stringify(at9)).not.toContain('methodId');
  });
});

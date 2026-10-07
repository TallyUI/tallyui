// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { precheckCommand } from '@tallyui/core/server';
import { createOrderBuilder } from '../order/order-builder';
import { contentVersion, ORDER_CREATE_MAX_VERSION, toOrderCreateEnvelope, UnsupportedOrderVersionError } from './command';
import { finalizeOrder } from './finalize';
import { posOrderCollection } from './schema';

const fixturePath = fileURLToPath(new URL('./__fixtures__/order-create-v6.json', import.meta.url));
const supported = { orderCreate: [1, 2, 3, 4, 5, 6], register: [1] };
function sale(coupons = true, fee = false) {
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
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  let nextId = 0;
  const order = finalizeOrder(builder.getSnapshot(), {
    now: new Date('2026-10-07T10:00:00.000Z'), newId: () => `019f6d2e-7800-7000-8000-${String(++nextId).padStart(12, '0')}`,
    capabilities: { orderCreate: 6 }, registerId: 'register_golden', cashierRef: 'cashier_golden',
  });
  order.lines[0].attributes = { Size: 'L', Colour: 'Red' };
  return order;
}

describe('order.create v6 coupon envelope (ADR-077)', () => {
  it('matches the golden file byte for byte with coupons, regular prices, attributes and receipt coupons', () => {
    const order = sale(), envelope = toOrderCreateEnvelope(order, 'device_golden', 1, { maxVersion: 6 });
    expect(JSON.stringify(envelope, null, 2) + '\n').toBe(readFileSync(fixturePath, 'utf8'));
    expect(envelope.version).toBe(6);
    expect(envelope.payload.coupons).toEqual([{ code: 'ten', couponId: '303', discountMinor: 130, discountTaxMinor: 26 }]);
    expect(envelope.payload.lines.map((line) => line.regularUnitPriceMinor)).toEqual([1000, 500]);
    expect(envelope.payload.lines[0].attributes).toEqual({ Size: 'L', Colour: 'Red' });
    expect(envelope.payload.lines[0].attributes).not.toBe(order.lines[0].attributes);
    expect(envelope.payload.display!.coupons).toEqual(order.display!.coupons);
    expect(envelope.payload.display!.coupons![0]).not.toBe(order.display!.coupons![0]);
  });

  it('passes the server precheck and resends the same payload at stored version 6', () => {
    const order = sale(), envelope = toOrderCreateEnvelope(order, 'device_golden', 1, { maxVersion: 6 });
    expect(precheckCommand(envelope, supported)).toBeUndefined();
    const resend = toOrderCreateEnvelope({ ...order, sentVersion: 6 }, 'device_golden', 2);
    expect(resend.version).toBe(6);
    expect(resend.payload).toEqual(envelope.payload);
  });

  it.each(['maxVersion', 'sentVersion'] as const)('refuses a coupon sale capped at 5 by %s', (cap) => {
    const order = sale();
    if (cap === 'sentVersion') order.sentVersion = 5;
    const send = () => toOrderCreateEnvelope(order, 'device_golden', 1, cap === 'maxVersion' ? { maxVersion: 5 } : undefined);
    expect(send).toThrow(UnsupportedOrderVersionError);
    expect(send).toThrow(expect.objectContaining({ needed: 6, supported: 5 }));
  });

  it.each([false, true])('keeps coupon-free envelope bytes unchanged (fee: %s)', (fee) => {
    const order = sale(false, fee), version = fee ? 5 : 4;
    const envelope = toOrderCreateEnvelope(order, 'device_golden', 1, { maxVersion: 6 });
    const prior = toOrderCreateEnvelope(order, 'device_golden', 1, { maxVersion: version });
    expect(envelope).toEqual(prior);
    expect(JSON.stringify(envelope)).toBe(JSON.stringify(prior));
    expect(envelope.version).toBe(version);
    for (const key of ['regularUnitPriceMinor', 'attributes', 'coupons']) expect(JSON.stringify(envelope)).not.toContain(`"${key}"`);
    expect(contentVersion(order)).toBe(fee ? 5 : 3);
  });

  it('strips stored receipt coupons from a coupon-free order', () => {
    const order = sale(false);
    order.display!.coupons = [{ code: 'ten', amountMinor: 130 }];
    const envelope = toOrderCreateEnvelope(order, 'device_golden', 1, { maxVersion: 6 });
    expect(envelope.payload.display).not.toHaveProperty('coupons');
  });

  it('pins both stored version maxima and the golden version to the till maximum', () => {
    const { properties } = posOrderCollection().schema;
    expect(properties.sentVersion.maximum).toBe(ORDER_CREATE_MAX_VERSION);
    expect(properties.downgradedFrom.maximum).toBe(ORDER_CREATE_MAX_VERSION);
    expect(JSON.parse(readFileSync(fixturePath, 'utf8')).version).toBe(ORDER_CREATE_MAX_VERSION);
    expect(contentVersion(sale())).toBe(6);
  });
});

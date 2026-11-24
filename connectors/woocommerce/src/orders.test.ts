import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError, CustomerServiceError, UnsupportedOrderFilterError } from '@tallyui/core';
import { createWooOrders, toWooStoreOrder } from './orders';
import { createWooCommerceConnector } from './index';
// Order 136 recorded from WCPOS 1.10.20's push response; order 137 derived from it by hand.
import list from './__tests__/fixtures/orders-1.10.20/list.json';

const context = {
  connectorId: 'woocommerce', baseUrl: 'https://woo.test/wp-json/wcpos/v2',
  headers: { Authorization: 'Bearer woo-token' }, signal: new AbortController().signal,
};
const orders = createWooOrders();
const request = { method: 'GET', headers: context.headers, signal: context.signal };

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('WooCommerce orders', () => {
  it('maps the recorded WCPOS order', () => {
    const order = toWooStoreOrder(list[0]);
    expect(order).toMatchObject({
      id: '136', reference: '136', clientOrderId: '3f7fa644-9d6d-40d5-800f-3eb18eea2203', status: 'completed',
      placedAt: '2026-10-06T04:54:03.000Z', currency: 'USD', pricesIncludeTax: false,
      totalMinor: 3291, taxMinor: 116, discountMinor: 0, discountTaxMinor: 0,
      fees: [], shipping: [], coupons: [],
      payments: [{ method: 'pos_cash', title: 'Cash', kind: 'cash', amountMinor: 3291 }], refunds: [], needsPayment: false,
      createdVia: 'woocommerce-pos', cashierId: '2', paidAt: '2026-10-06T04:54:03.000Z',
    });
    expect(order).not.toHaveProperty('storeId');
    expect(order).not.toHaveProperty('registerId');
    expect(order.customer).toBeNull();
    expect(order.lines).toHaveLength(4);
    expect(order.lines[0]).toStrictEqual({
      id: '20', clientLineId: '0d652d8c-ce3b-40c4-b1cf-a747261b5eb8', productId: '80', variantId: '80', name: 'Espresso',
      sku: 'COF-ESP', quantity: 3, subtotalMinor: 900, subtotalTaxMinor: 97, totalMinor: 900, taxMinor: 97,
    });
    expect(order.lines.map((line) => line.id)).toStrictEqual(['20', '21', '22', '23']);
    expect(order.taxLines[0]).toStrictEqual({ label: 'CA State', code: 'US-CA-CA STATE-1', ratePpm: 72500, amountMinor: 65 });
    expect(order.taxLines.map((tax) => tax.ratePpm)).toStrictEqual([72500, 13750, 20000, 55000, 0]);
  });

  it('maps customer, coupon, negative fee, shipping, card payment and refunds', () => {
    const order = toWooStoreOrder(list[1]);
    expect(order).toMatchObject({
      id: '137', reference: '137', clientOrderId: '00000000-0000-4000-8000-000000000137',
      customer: { id: '5', name: 'Ada Lovelace', email: 'ada@example.com' },
      coupons: [{ code: 'save5', discountMinor: 500, discountTaxMinor: 0 }],
      fees: [{ name: 'Loyalty', totalMinor: -100, taxMinor: 0 }],
      shipping: [{ name: 'Delivery', totalMinor: 400, taxMinor: 0 }],
      payments: [{ method: 'pos_card', title: 'Card', kind: 'external', amountMinor: 3291 }],
      refunds: [{ id: '140', amountMinor: 350, reason: 'Damaged' }],
    });
    expect(order.fees).toStrictEqual([{ id: '31', name: 'Loyalty', totalMinor: -100, taxMinor: 0, taxStatus: 'none' }]);
    expect(order.shipping).toStrictEqual([{ id: '32', name: 'Delivery', totalMinor: 400, taxMinor: 0, methodId: 'flat_rate' }]);
    expect(order.payments[0]).not.toHaveProperty('id');
    expect(order.lines[0]!.clientLineId).toBe('00000000-0000-4000-8000-000000001370');
  });

  it('leaves out unset keys and maps a variation, an unknown method and missing arrays', () => {
    const order = toWooStoreOrder({
      id: 9, status: 'processing', currency: 'USD', date_created_gmt: '2026-10-06T04:54:03+00:00', customer_id: 0,
      billing: { first_name: '', last_name: '', email: 'guest@example.com' },
      line_items: [{ id: 1, name: 'Shirt', product_id: 5, variation_id: 7, quantity: 1, sku: '',
        subtotal: '1.00', subtotal_tax: '0.00', total: '1.00', total_tax: '0.00', meta_data: [] }],
      tax_lines: [{ label: 'Tax', rate_code: '', rate_percent: 'x', tax_total: '0.10', shipping_tax_total: '0.05' }],
      discount_total: '0', discount_tax: '0', total_tax: '0.15', total: '1.15',
      payment_method: 'bacs', payment_method_title: '',
      date_paid_gmt: '2026-10-06T04:54:03',
    });
    expect(order.reference).toBe('9');
    expect(order).not.toHaveProperty('clientOrderId');
    expect(order.customer).toStrictEqual({ email: 'guest@example.com' });
    expect(order.lines[0]).toStrictEqual({
      id: '1', productId: '5', variantId: '7', name: 'Shirt', quantity: 1,
      subtotalMinor: 100, subtotalTaxMinor: 0, totalMinor: 100, taxMinor: 0,
    });
    expect(order.taxLines).toStrictEqual([{ label: 'Tax', ratePpm: 0, amountMinor: 15 }]);
    expect(order.payments).toStrictEqual([{ method: 'bacs', amountMinor: 115 }]);
    expect(order).toMatchObject({ fees: [], shipping: [], coupons: [], refunds: [] });
  });

  it('reports no payments for an unpaid order', () => {
    const raw = {
      id: 9, status: 'pending', currency: 'USD', date_created_gmt: '2026-10-06T04:54:03',
      discount_total: '0', discount_tax: '0', total_tax: '0', total: '15.10', payment_method: 'cod',
    };
    expect(toWooStoreOrder(raw).payments).toStrictEqual([]);
    expect(toWooStoreOrder({ ...raw, date_paid: null, date_paid_gmt: '' }).payments).toStrictEqual([]);
    expect(toWooStoreOrder(raw)).not.toHaveProperty('paidAt');
    expect(toWooStoreOrder({ ...raw, date_paid: null, date_paid_gmt: '' })).not.toHaveProperty('paidAt');
  });

  it('reads date_paid_gmt as a UTC instant only when it parses', () => {
    const raw = {
      id: 9, status: 'completed', currency: 'USD', date_created_gmt: '2026-10-06T04:54:03',
      discount_total: '0', discount_tax: '0', total_tax: '0', total: '15.10', payment_method: 'pos_cash',
    };
    expect(toWooStoreOrder({ ...raw, date_paid_gmt: '2026-10-06T04:54:03' }).paidAt).toBe('2026-10-06T04:54:03.000Z');
    expect(toWooStoreOrder({ ...raw, date_paid_gmt: '2026-10-06T06:54:03+02:00' }).paidAt).toBe('2026-10-06T04:54:03.000Z');
    for (const paid of [{ date_paid_gmt: 'not a date' }, { date_paid_gmt: null }, { date_paid_gmt: 7 }, { date_paid: '2026-10-06T04:54:03' }]) {
      expect(() => toWooStoreOrder({ ...raw, ...paid })).not.toThrow();
      expect(toWooStoreOrder({ ...raw, ...paid })).not.toHaveProperty('paidAt');
    }
  });

  it('reads needs_payment only when it is a boolean', () => {
    const raw = {
      id: 9, status: 'pending', currency: 'USD', date_created_gmt: '2026-10-06T04:54:03',
      discount_total: '0', discount_tax: '0', total_tax: '0', total: '15.10', payment_method: 'cod',
    };
    expect(toWooStoreOrder({ ...raw, needs_payment: true }).needsPayment).toBe(true);
    expect(toWooStoreOrder({ ...raw, needs_payment: false }).needsPayment).toBe(false);
    for (const needsPayment of [{}, { needs_payment: 'yes' }, { needs_payment: 1 }, { needs_payment: null }]) {
      expect(toWooStoreOrder({ ...raw, ...needsPayment })).not.toHaveProperty('needsPayment');
    }
  });

  it('reads created_via only when it is a non-empty string', () => {
    const raw = {
      id: 9, status: 'pending', currency: 'USD', date_created_gmt: '2026-10-06T04:54:03',
      discount_total: '0', discount_tax: '0', total_tax: '0', total: '15.10', payment_method: 'cod',
    };
    expect(toWooStoreOrder({ ...raw, created_via: 'checkout' }).createdVia).toBe('checkout');
    for (const createdVia of [{}, { created_via: '' }, { created_via: null }, { created_via: 7 }]) {
      expect(toWooStoreOrder({ ...raw, ...createdVia })).not.toHaveProperty('createdVia');
    }
  });

  it('reads cashier, store and register from order meta', () => {
    const raw = {
      id: 9, status: 'pending', currency: 'USD', date_created_gmt: '2026-10-06T04:54:03',
      discount_total: '0', discount_tax: '0', total_tax: '0', total: '15.10', payment_method: 'cod',
    };
    const meta = (key: string, value: unknown) => ({ ...raw, meta_data: [{ key, value }] });
    expect(toWooStoreOrder({ ...raw, meta_data: [
      { key: '_pos_user', value: '7' }, { key: '_pos_store', value: '3' }, { key: '_wcpos_register', value: 'reg-a1' },
    ] })).toMatchObject({ cashierId: '7', storeId: '3', registerId: 'reg-a1' });
    for (const value of ['0', '', 'abc', 3]) expect(toWooStoreOrder(meta('_pos_store', value))).not.toHaveProperty('storeId');
    expect(toWooStoreOrder(meta('_pos_user', '0'))).not.toHaveProperty('cashierId');
    expect(toWooStoreOrder(meta('_wcpos_register', ''))).not.toHaveProperty('registerId');
    const bare = toWooStoreOrder(raw);
    for (const field of ['cashierId', 'storeId', 'registerId']) expect(bare).not.toHaveProperty(field);
  });

  it('reports the captured rows of a payment ledger in order', () => {
    const order = toWooStoreOrder({
      id: 9, status: 'processing', currency: 'USD', date_created_gmt: '2026-10-06T04:54:03',
      discount_total: '0', discount_tax: '0', total_tax: '0', total: '15.10',
      payment_method: 'pos_card', payment_method_title: 'Cash + Card', date_paid_gmt: '2026-10-06T04:54:03',
      meta_data: [{ key: '_wcpos_payments', value: { schema: 1, payments: [
        { id: '1', method_id: 'pos_cash', amount: '5.00', currency: 'USD', status: 'captured' },
        { id: '2', method_id: 'pos_card', amount: '7.10', currency: 'USD', status: 'captured' },
        { id: '3', method_id: 'pos_card', amount: '3.00', currency: 'USD', status: 'authorized' },
        { id: '4', method_id: 'pos_cash', amount: '1.00', currency: 'USD', status: 'voided' },
        { id: '5', method_id: 'stripe', amount: '2.00', currency: 'USD', status: 'failed' },
      ] } }],
    });
    expect(order.payments).toStrictEqual([
      { id: '1', method: 'pos_cash', kind: 'cash', amountMinor: 500 },
      { id: '2', method: 'pos_card', kind: 'external', amountMinor: 710 },
    ]);
  });

  it('falls back to the paid rule for a ledger with no captured row', () => {
    const raw = {
      id: 9, status: 'processing', currency: 'USD', date_created_gmt: '2026-10-06T04:54:03',
      discount_total: '0', discount_tax: '0', total_tax: '0', total: '15.10',
      payment_method: 'pos_card', payment_method_title: 'Card', date_paid_gmt: '2026-10-06T04:54:03',
      meta_data: [{ key: '_wcpos_payments', value: { schema: 1, payments: [
        { id: '1', method_id: 'pos_card', amount: '15.10', currency: 'USD', status: 'pending' },
      ] } }],
    };
    expect(toWooStoreOrder(raw).payments).toStrictEqual([{ method: 'pos_card', title: 'Card', kind: 'external', amountMinor: 1510 }]);
    expect(toWooStoreOrder({ ...raw, date_paid_gmt: undefined }).payments).toStrictEqual([]);
  });

  it('gives the title to ledger rows that all share the order method', () => {
    const order = toWooStoreOrder({
      id: 9, status: 'processing', currency: 'USD', date_created_gmt: '2026-10-06T04:54:03',
      discount_total: '0', discount_tax: '0', total_tax: '0', total: '10.00',
      payment_method: 'pos_card', payment_method_title: 'Card',
      meta_data: [{ key: '_wcpos_payments', value: { schema: 1, payments: [
        { method_id: 'pos_card', amount: '4.00', currency: 'USD', status: 'captured' },
        { method_id: 'pos_card', amount: '6.00', currency: 'USD', status: 'captured' },
      ] } }],
    });
    expect(order.payments).toStrictEqual([
      { method: 'pos_card', title: 'Card', kind: 'external', amountMinor: 400 },
      { method: 'pos_card', title: 'Card', kind: 'external', amountMinor: 600 },
    ]);
  });

  it('treats date_paid alone as paid', () => {
    const order = toWooStoreOrder({
      id: 9, status: 'processing', currency: 'USD', date_created_gmt: '2026-10-06T04:54:03',
      discount_total: '0', discount_tax: '0', total_tax: '0', total: '15.10',
      payment_method: 'cod', date_paid: '2026-10-06T04:54:03',
    });
    expect(order.payments).toStrictEqual([{ method: 'cod', amountMinor: 1510 }]);
  });

  it('throws a server error for a captured ledger row without a method', () => {
    const call = () => toWooStoreOrder({
      id: 9, status: 'processing', currency: 'USD', date_created_gmt: '2026-10-06T04:54:03',
      discount_total: '0', discount_tax: '0', total_tax: '0', total: '15.10',
      meta_data: [{ key: '_wcpos_payments', value: { schema: 1, payments: [
        { method_id: '', amount: '5.00', currency: 'USD', status: 'captured' },
      ] } }],
    });
    expect(call).toThrow(CustomerServiceError);
    expect(call).toThrow(expect.objectContaining({ code: 'server', message: 'unexpected response' }));
  });

  it('reads a 2.0 order with a 6dp total and 2dp ledger amounts', () => {
    const order = toWooStoreOrder({
      id: 9, status: 'processing', currency: 'USD', date_created_gmt: '2026-10-06T04:54:03',
      discount_total: '0', discount_tax: '0', total_tax: '0', total: '9.900000',
      meta_data: [{ key: '_wcpos_payments', value: { schema: 1, payments: [
        { method_id: 'pos_cash', amount: '9.90', currency: 'USD', status: 'captured' },
      ] } }],
    });
    expect(order.payments).toStrictEqual([{ method: 'pos_cash', kind: 'cash', amountMinor: 990 }]);
  });

  it('throws a server error for a captured ledger row in another currency', () => {
    const call = () => toWooStoreOrder({
      id: 9, status: 'processing', currency: 'USD', date_created_gmt: '2026-10-06T04:54:03',
      discount_total: '0', discount_tax: '0', total_tax: '0', total: '15.10',
      meta_data: [{ key: '_wcpos_payments', value: { schema: 1, payments: [
        { id: '1', method_id: 'pos_cash', amount: '5.00', currency: 'EUR', status: 'captured' },
      ] } }],
    });
    expect(call).toThrow(CustomerServiceError);
    expect(call).toThrow(expect.objectContaining({ code: 'server', message: 'unexpected response' }));
  });

  it('falls back to a payment of the total for a paid order with a schema 2 ledger', () => {
    const order = toWooStoreOrder({
      id: 9, status: 'processing', currency: 'USD', date_created_gmt: '2026-10-06T04:54:03',
      discount_total: '0', discount_tax: '0', total_tax: '0', total: '15.10',
      payment_method: 'pos_card', payment_method_title: 'Card', date_paid_gmt: '2026-10-06T04:54:03',
      meta_data: [{ key: '_wcpos_payments', value: { schema: 2, payments: [
        { id: '1', method_id: 'pos_cash', amount: '5.00', currency: 'USD', status: 'captured' },
      ] } }],
    });
    expect(order.payments).toStrictEqual([{ method: 'pos_card', title: 'Card', kind: 'external', amountMinor: 1510 }]);
  });

  it.each([
    { schema: 2, payments: [] }, { schema: 1 }, { schema: 1, payments: 'x' }, 'x', null,
  ])('flags an unreadable payment ledger %j while keeping the paid-state fallback', (value) => {
    const order = toWooStoreOrder({
      id: 9, currency: 'USD', date_created_gmt: '2026-10-06T04:54:03',
      discount_total: '0', discount_tax: '0', total_tax: '0', total: '15.10',
      date_paid_gmt: '2026-10-06T04:54:03', payment_method: 'pos_cash',
      meta_data: [{ key: '_wcpos_payments', value }],
    });
    expect(order.paymentRecordUnreadable).toBe(true);
    expect(order.payments).toStrictEqual([{ method: 'pos_cash', kind: 'cash', amountMinor: 1510 }]);
  });

  it('leaves out the unreadable flag for absent or readable payment ledgers', () => {
    for (const meta_data of [
      [],
      [{ key: '_wcpos_payments', value: { schema: 1, payments: [] } }],
      [{ key: '_wcpos_payments', value: { schema: 1, payments: [
        { method_id: 'pos_cash', amount: '15.10', currency: 'USD', status: 'captured' },
      ] } }],
      [{ key: '_wcpos_payments', value: { schema: 1, payments: [
        { method_id: 'pos_cash', amount: '15.10', currency: 'USD', status: 'pending' },
      ] } }],
    ]) {
      const order = toWooStoreOrder({
        id: 9, currency: 'USD', date_created_gmt: '2026-10-06T04:54:03',
        discount_total: '0', discount_tax: '0', total_tax: '0', total: '15.10',
        date_paid_gmt: '2026-10-06T04:54:03', payment_method: 'pos_cash', meta_data,
      });
      expect(order).not.toHaveProperty('paymentRecordUnreadable');
    }
  });

  it('reads the store revision only when it is a non-empty string', () => {
    const raw = {
      id: 9, currency: 'USD', date_created_gmt: '2026-10-06T04:54:03',
      discount_total: '0', discount_tax: '0', total_tax: '0', total: '0',
    };
    expect(toWooStoreOrder({ ...raw, _rxdb_revision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298' }).revision).toBe('sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298');
    for (const revision of [{}, { _rxdb_revision: '' }, { _rxdb_revision: 7 }]) {
      expect(toWooStoreOrder({ ...raw, ...revision })).not.toHaveProperty('revision');
    }
  });

  it('reads the recorded fee id, tax status and tax class only when defined', () => {
    const order = toWooStoreOrder({
      id: 9, currency: 'USD', date_created_gmt: '2026-10-06T04:54:03',
      discount_total: '0', discount_tax: '0', total_tax: '0', total: '2.00',
      fee_lines: [
        { id: 7, name: 'Fee', total: '1.00', total_tax: '0', tax_status: 'taxable', tax_class: 'reduced-rate' },
        { id: 0, name: 'Fee', total: '1.00', total_tax: '0', tax_status: 'shipping', tax_class: '' },
      ],
    });
    expect(order.fees).toStrictEqual([
      { id: '7', name: 'Fee', totalMinor: 100, taxMinor: 0, taxStatus: 'taxable', taxClass: 'reduced-rate' },
      { name: 'Fee', totalMinor: 100, taxMinor: 0 },
    ]);
  });

  it('reads the recorded shipping id, method and tax status', () => {
    const order = toWooStoreOrder({
      id: 9, currency: 'USD', date_created_gmt: '2026-10-06T04:54:03',
      discount_total: '0', discount_tax: '0', total_tax: '0', total: '2.00',
      shipping_lines: [
        { id: 9, method_title: 'Delivery', method_id: 'pos', total: '1.00', total_tax: '0', tax_status: 'taxable' },
        { method_title: 'Delivery', method_id: '', total: '1.00', total_tax: '0', tax_status: 'shipping' },
        { method_title: 'Delivery', total: '1.00', total_tax: '0', tax_status: 'none', tax_class: 'reduced-rate' },
      ],
    });
    expect(order.shipping).toStrictEqual([
      { id: '9', name: 'Delivery', totalMinor: 100, taxMinor: 0, methodId: 'pos', taxStatus: 'taxable' },
      { name: 'Delivery', totalMinor: 100, taxMinor: 0 },
      { name: 'Delivery', totalMinor: 100, taxMinor: 0, taxStatus: 'none' },
    ]);
  });

  it('leaves out absent or empty captured payment ids', () => {
    const order = toWooStoreOrder({
      id: 9, currency: 'USD', date_created_gmt: '2026-10-06T04:54:03',
      discount_total: '0', discount_tax: '0', total_tax: '0', total: '2.00',
      meta_data: [{ key: '_wcpos_payments', value: { schema: 1, payments: [
        { method_id: 'pos_cash', amount: '1.00', status: 'captured' },
        { id: '', method_id: 'pos_cash', amount: '1.00', status: 'captured' },
      ] } }],
    });
    expect(order.payments).toHaveLength(2);
    for (const payment of order.payments) expect(payment).not.toHaveProperty('id');
  });

  it('maps a "-0.00" fee to a positive zero', () => {
    const fee = toWooStoreOrder({ ...list[1], fee_lines: [{ ...list[1]!.fee_lines[0]!, total: '-0.00' }] }).fees[0]!;
    expect(fee.totalMinor).toBe(0);
    expect(Object.is(fee.totalMinor, 0)).toBe(true);
  });

  it('maps 6dp tax so that net + tax is the gross rounded once (inclusive GBP, 20 % VAT)', () => {
    const [line] = list[1]!.line_items;
    // Rounded on its own, each figure gives one minor unit too many: 13 + 3, 63 + 13, 43 + 9, 33 + 7, 129 + 26, 29 + 6.
    const order = toWooStoreOrder({
      ...list[1], currency: 'GBP', prices_include_tax: true, total: '2.590000',
      line_items: [
        { ...line, quantity: 1, subtotal: '0.125000', subtotal_tax: '0.025000', total: '0.125000', total_tax: '0.025000' },
        { ...line, id: 21, quantity: 1, subtotal: '0.625000', subtotal_tax: '0.125000', total: '0.427517', total_tax: '0.085503' },
      ],
      fee_lines: [{ ...list[1]!.fee_lines[0], tax_status: 'taxable', total: '0.326667', total_tax: '0.065333' }],
      shipping_lines: [{ ...list[1]!.shipping_lines[0], total: '1.286000', total_tax: '0.257200' }],
      coupon_lines: [{ ...list[1]!.coupon_lines[0], discount: '0.286000', discount_tax: '0.057200' }],
    });
    const gross = (net: number, tax: number) => net + tax;
    expect(order.lines.map((l) => [gross(l.subtotalMinor, l.subtotalTaxMinor), gross(l.totalMinor, l.taxMinor)])).toStrictEqual([[15, 15], [75, 51]]);
    expect(order.lines[0]).toMatchObject({ subtotalMinor: 13, subtotalTaxMinor: 2, totalMinor: 13, taxMinor: 2 });
    expect(order.fees.map((fee) => gross(fee.totalMinor, fee.taxMinor))).toStrictEqual([39]);
    expect(order.shipping.map((ship) => gross(ship.totalMinor, ship.taxMinor))).toStrictEqual([154]);
    expect(order.coupons.map((coupon) => gross(coupon.discountMinor, coupon.discountTaxMinor))).toStrictEqual([34]);
    const charges = [...order.fees, ...order.shipping];
    expect(order.lines.reduce((sum, l) => sum + l.totalMinor + l.taxMinor, 0) + charges.reduce((sum, c) => sum + c.totalMinor + c.taxMinor, 0))
      .toBe(order.totalMinor);
    expect(order.totalMinor).toBe(259);
  });

  it('rounds exact half-cent gross amounts away from zero on an inclusive GBP order', () => {
    const order = toWooStoreOrder({
      ...list[1], currency: 'GBP', prices_include_tax: true,
      line_items: [{ ...list[1]!.line_items[0], total: '0.125000', total_tax: '0.020000' }],
      fee_lines: [
        { name: 'Fee', total: '1.000000', total_tax: '0.005000' },
        { name: 'Negative fee', total: '-0.125000', total_tax: '-0.020000' },
      ],
    });
    expect(order.lines[0]!.totalMinor).toBe(13);
    expect(order.lines[0]!.totalMinor + order.lines[0]!.taxMinor).toBe(15);
    expect(order.fees.map((fee) => fee.totalMinor + fee.taxMinor)).toStrictEqual([101, -15]);
  });

  it.each([
    ['JPY', '1', '0.500000', 2],
    ['KWD', '-1.000', '-0.000500', -1001],
  ])('rounds an exact half-minor-unit gross away from zero in %s', (currency, total, total_tax, expected) => {
    const order = toWooStoreOrder({
      ...list[1], currency, prices_include_tax: true,
      fee_lines: [{ name: 'Fee', total, total_tax }],
    });
    expect(order.fees[0]!.totalMinor + order.fees[0]!.taxMinor).toBe(expected);
  });

  it('maps a negative 6dp fee symmetrically', () => {
    const fee = toWooStoreOrder({ ...list[1], fee_lines: [{ ...list[1]!.fee_lines[0]!, total: '-0.125000', total_tax: '-0.025000' }] }).fees[0]!;
    expect(fee).toStrictEqual({ id: '31', name: 'Loyalty', totalMinor: -13, taxMinor: -2, taxStatus: 'none' });
  });

  it('throws a server error on an unparseable tax amount', () => {
    for (const total_tax of ['abc', 0.5, '1e3', '--1', undefined]) {
      expect(() => toWooStoreOrder({ ...list[1], fee_lines: [{ ...list[1]!.fee_lines[0]!, total_tax }] }))
        .toThrow(expect.objectContaining({ code: 'server', message: 'unexpected response' }));
    }
  });

  it('throws a server error on an unparseable amount', () => {
    for (const total of ['abc', 32.91, '1e3', '--1']) {
      const call = () => toWooStoreOrder({ ...list[0], total });
      expect(call).toThrow(CustomerServiceError);
      expect(call).toThrow(expect.objectContaining({ code: 'server', message: 'unexpected response' }));
    }
  });

  it('throws a server error on a row without date_created_gmt', () => {
    const { date_created_gmt: _omitted, ...withoutDate } = list[0]!;
    for (const row of [withoutDate, { ...list[0], date_created_gmt: 'not a date' }, { ...list[0], id: undefined }, null, 'order']) {
      expect(() => toWooStoreOrder(row)).toThrow(expect.objectContaining({ code: 'server', message: 'unexpected response' }));
    }
  });

  it('lists a page newest first', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json(list, { headers: { 'X-WP-TotalPages': '3' } }))
      .mockResolvedValueOnce(Response.json(list, { headers: { 'X-WP-TotalPages': '2' } }));
    const first = await orders.listOrders(context, { page: 2, perPage: 10, search: '  ada ' });
    expect(spy).toHaveBeenNthCalledWith(1, `${context.baseUrl}/orders?page=2&per_page=10&orderby=date&order=desc&search=ada`, request);
    expect(first.orders.map((order) => order.id)).toStrictEqual(['136', '137']);
    expect(first.hasMore).toBe(true);
    await expect(orders.listOrders(context, { page: 2, perPage: 10, search: ' ' })).resolves.toMatchObject({ hasMore: false });
    expect(spy).toHaveBeenNthCalledWith(2, `${context.baseUrl}/orders?page=2&per_page=10&orderby=date&order=desc`, request);
  });

  it('leaves out and counts an unreadable order without ending paging early', async () => {
    const badRow = { ...list[1], meta_data: [{ key: '_wcpos_payments', value: { schema: 1, payments: [
      { method_id: 'pos_cash', amount: '5.00', currency: 'EUR', status: 'captured' },
    ] } }] };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json([list[0], badRow]));
    const result = await orders.listOrders(context, { perPage: 2 });
    expect(result.orders.map((order) => order.id)).toStrictEqual(['136']);
    expect(result).toMatchObject({ unreadable: 1, hasMore: true });
  });

  it('leaves out unreadable when every order on the page is readable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(list));
    await expect(orders.listOrders(context)).resolves.not.toHaveProperty('unreadable');
  });

  it('rejects a non-data error while reading a row instead of counting it as unreadable', async () => {
    const error = new TypeError('boom');
    const row = { ...list[0], get status() { throw error; } };
    const response = new Response();
    vi.spyOn(response, 'json').mockResolvedValueOnce([row]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
    await expect(orders.listOrders(context)).rejects.toBe(error);
  });

  it('rejects a lookup of an unreadable order', async () => {
    const badRow = { ...list[1], meta_data: [{ key: '_wcpos_payments', value: { schema: 1, payments: [
      { method_id: 'pos_cash', amount: '5.00', currency: 'EUR', status: 'captured' },
    ] } }] };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json([badRow]));
    await expect(orders.getOrders(context, ['137'])).rejects.toEqual(expect.objectContaining({ code: 'server' }));
  });

  describe('listOrders total', () => {
    it('includes the store total alongside hasMore', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(list, {
        headers: { 'X-WP-Total': '137', 'X-WP-TotalPages': '6' },
      }));
      await expect(orders.listOrders(context, { page: 2, perPage: 25 })).resolves.toMatchObject({ total: 137, hasMore: true });
    });

    it.each([['missing', undefined], ['empty', ''], ['non-numeric', 'abc'], ['negative', '-1'], ['fractional', '1.5']])(
      'has no total key for a %s X-WP-Total', async (_name, total) => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(list, total === undefined ? {} : { headers: { 'X-WP-Total': total } }));
        const result = await orders.listOrders(context);
        expect('total' in result).toBe(false);
        expect(result.orders.map((order) => order.id)).toStrictEqual(['136', '137']);
      },
    );
  });

  it('falls back to a full page for hasMore', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json(list))
      .mockResolvedValueOnce(Response.json(list));
    await expect(orders.listOrders(context, { perPage: 2 })).resolves.toMatchObject({ hasMore: true });
    await expect(orders.listOrders(context, { perPage: 3 })).resolves.toMatchObject({ hasMore: false });
  });

  it('clamps page and perPage', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json([]));
    await orders.listOrders(context, { page: 0, perPage: 500 });
    await orders.listOrders(context, { page: 2.7, perPage: 0 });
    await orders.listOrders(context);
    const params = spy.mock.calls.map(([url]) => {
      const search = new URL(url as string).searchParams;
      return [search.get('page'), search.get('per_page')];
    });
    expect(params).toStrictEqual([['1', '100'], ['2', '1'], ['1', '25']]);
  });

  it('rejects a list body that is not an array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({}));
    await expect(orders.listOrders(context)).rejects.toMatchObject({ code: 'server', message: 'unexpected response' });
  });

  it('gets orders in the order asked, skipping unknown and malformed ids', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(list));
    const result = await orders.getOrders(context, ['137', 'abc', '136', '999', '137']);
    expect(spy).toHaveBeenCalledExactlyOnceWith(`${context.baseUrl}/orders?include=137,136,999&per_page=3`, request);
    expect(result.map((order) => order.id)).toStrictEqual(['137', '136']);
  });

  it('gets more than 100 ids in chunks', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json([]));
    const ids = Array.from({ length: 101 }, (_, index) => String(index + 1));
    await expect(orders.getOrders(context, ids)).resolves.toStrictEqual([]);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0]![0]).toBe(`${context.baseUrl}/orders?include=${ids.slice(0, 100).join(',')}&per_page=100`);
    expect(spy.mock.calls[1]![0]).toBe(`${context.baseUrl}/orders?include=101&per_page=1`);
  });

  it('makes no request for no valid ids', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    await expect(orders.getOrders(context, ['0', '01', 'x', '-1', ''])).resolves.toStrictEqual([]);
    await expect(orders.getOrders(context, [])).resolves.toStrictEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('maps 401 to ConnectorUnauthorizedError and 500 to a server CustomerServiceError', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({}, { status: 401 }))
      .mockResolvedValueOnce(Response.json({}, { status: 500 }))
      .mockResolvedValueOnce(Response.json({}, { status: 401 }))
      .mockResolvedValueOnce(Response.json({}, { status: 500 }));
    await expect(orders.listOrders(context)).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
    await expect(orders.listOrders(context)).rejects.toMatchObject({ name: 'CustomerServiceError', code: 'server', message: 'HTTP 500' });
    await expect(orders.getOrders(context, ['136'])).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
    await expect(orders.getOrders(context, ['136'])).rejects.toMatchObject({ name: 'CustomerServiceError', code: 'server', message: 'HTTP 500' });
  });

  describe('listOrders filters (#721)', () => {
    const emptyList = () => vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json([]));
    // The params a call sent beyond the page and order ones every list request carries.
    const filterParams = (url: unknown) => {
      const params = new URL(url as string).searchParams;
      for (const key of ['page', 'per_page', 'orderby', 'order']) params.delete(key);
      return [...params.entries()];
    };

    it.each([
      [{ status: 'cancelled' }, [['status', 'cancelled']]],
      [{ customerId: '3' }, [['customer', '3']]],
      [{ cashierId: '2' }, [['pos_cashier', '2']]],
      [{ storeId: '1' }, [['pos_store', '1']]],
      [{ createdVia: 'woocommerce-pos' }, [['created_via', 'woocommerce-pos']]],
      [{ customerId: '0' }, [['customer', '0']]],
      [{}, []],
    ])('sends %o as exactly its own param', async (query, expected) => {
      const spy = emptyList();
      await expect(orders.listOrders(context, query)).resolves.toStrictEqual({ orders: [], hasMore: false });
      expect(spy).toHaveBeenCalledOnce();
      expect(filterParams(spy.mock.calls[0]![0])).toStrictEqual(expected);
    });

    it('sends every filter with the page and search params in one request', async () => {
      const spy = emptyList();
      await orders.listOrders(context, {
        page: 2, perPage: 10, search: 'ada', status: 'cancelled', customerId: '3', cashierId: '2', storeId: '1',
        createdVia: 'woocommerce-pos', dateRange: { after: '2026-11-10T00:00:00.000Z', before: '2026-11-11T00:00:00.000Z' },
      });
      expect(spy).toHaveBeenCalledExactlyOnceWith(
        `${context.baseUrl}/orders?page=2&per_page=10&orderby=date&order=desc&search=ada&status=cancelled&customer=3&pos_cashier=2`
          + '&pos_store=1&created_via=woocommerce-pos&dates_are_gmt=true&after=2026-11-09T23%3A59%3A59&before=2026-11-11T00%3A00%3A00',
        request,
      );
    });

    it.each(['registerId', 'paymentMethod'] as const)('refuses %s before any request', async (field) => {
      const spy = emptyList();
      const result = orders.listOrders(context, { status: 'cancelled', [field]: '1' });
      await expect(result).rejects.toBeInstanceOf(UnsupportedOrderFilterError);
      await expect(result).rejects.toMatchObject({ code: 'unsupported_order_filter', fields: [field] });
      expect(spy).not.toHaveBeenCalled();
    });

    // No WooCommerce order has an empty status or created_via, so '' matches nothing and is never sent.
    it.each([{ status: '' }, { createdVia: '' }])('resolves no orders without a request for %o', async (query) => {
      const spy = emptyList();
      await expect(orders.listOrders(context, query)).resolves.toStrictEqual({ orders: [], hasMore: false });
      expect(spy).not.toHaveBeenCalled();
    });

    it.each([
      ['customerId', 'abc'], ['cashierId', 'abc'], ['storeId', 'abc'], ['cashierId', ''], ['storeId', '-1'], ['customerId', '1.5'],
    ] as const)('resolves no orders without a request for %s %o', async (field, value) => {
      const spy = emptyList();
      await expect(orders.listOrders(context, { status: 'cancelled', [field]: value })).resolves.toStrictEqual({ orders: [], hasMore: false });
      expect(spy).not.toHaveBeenCalled();
    });

    it.each([
      [{ after: '2026-11-10T09:36:28.000Z' }, [['dates_are_gmt', 'true'], ['after', '2026-11-10T09:36:27']]],
      [{ after: '2026-11-10T09:36:28.400Z' }, [['dates_are_gmt', 'true'], ['after', '2026-11-10T09:36:28']]],
      [{ after: '2026-11-10T00:00:00Z' }, [['dates_are_gmt', 'true'], ['after', '2026-11-09T23:59:59']]],
      [{ before: '2026-11-10T09:36:28.400Z' }, [['dates_are_gmt', 'true'], ['before', '2026-11-10T09:36:29']]],
      [{ before: '2026-11-10T09:36:29.000Z' }, [['dates_are_gmt', 'true'], ['before', '2026-11-10T09:36:29']]],
      [{ after: '2026-11-10T09:36:28.000Z', before: '2026-11-10T09:36:29.000Z' },
        [['dates_are_gmt', 'true'], ['after', '2026-11-10T09:36:27'], ['before', '2026-11-10T09:36:29']]],
    ])('sends dateRange %o as GMT whole seconds', async (dateRange, expected) => {
      const spy = emptyList();
      await orders.listOrders(context, { dateRange });
      expect(filterParams(spy.mock.calls[0]![0])).toStrictEqual(expected);
    });

    it.each([{ after: '2026-11-10T09:36:28' }, { before: '2026-11-10T09:36:28+00:00' }])('refuses dateRange %o before any request', async (dateRange) => {
      const spy = emptyList();
      await expect(orders.listOrders(context, { dateRange })).rejects.toBeInstanceOf(TypeError);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  it('createWooCommerceConnector exposes listOrders, getOrders and its order filters', async () => {
    const connector = createWooCommerceConnector();
    expect(connector.listOrders).toBeTypeOf('function');
    expect(connector.getOrders).toBeTypeOf('function');
    expect(connector.orderFilters).toStrictEqual(['status', 'customerId', 'cashierId', 'storeId', 'createdVia', 'dateRange']);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json([list[0]]));
    await expect(connector.getOrders!(context, ['136'])).resolves.toMatchObject([{ id: '136' }]);
  });
});

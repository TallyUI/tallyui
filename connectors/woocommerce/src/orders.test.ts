import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError, CustomerServiceError } from '@tallyui/core';
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
      payments: [{ method: 'pos_cash', title: 'Cash', kind: 'cash', amountMinor: 3291 }], refunds: [],
    });
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
    expect(fee).toStrictEqual({ name: 'Loyalty', totalMinor: -13, taxMinor: -2 });
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

  it('createWooCommerceConnector exposes listOrders and getOrders', async () => {
    const connector = createWooCommerceConnector();
    expect(connector.listOrders).toBeTypeOf('function');
    expect(connector.getOrders).toBeTypeOf('function');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json([list[0]]));
    await expect(connector.getOrders!(context, ['136'])).resolves.toMatchObject([{ id: '136' }]);
  });
});

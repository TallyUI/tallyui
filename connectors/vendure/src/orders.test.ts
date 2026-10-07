import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError } from '@tallyui/core';
import { getVendureOrder, listVendureOrders, type VendureOrder, type VendureOrderSummary } from './index';

const context = {
  connectorId: 'vendure', baseUrl: 'https://vendure.test',
  headers: { Authorization: 'Bearer admin-token', 'vendure-token': 'channel-token' },
  signal: new AbortController().signal,
};
const summary: VendureOrderSummary = {
  id: '12', code: 'ORDER-12', state: 'PaymentSettled',
  orderPlacedAt: '2026-01-02T10:00:00.000Z', updatedAt: '2026-01-02T10:01:00.000Z',
  currencyCode: 'USD', totalQuantity: 2, total: 1000, totalWithTax: 1200,
  customer: { id: '1', firstName: 'Ada', lastName: 'Lovelace', emailAddress: 'ada@example.com' },
  customFields: {
    tallyClientOrderId: 'client-12', tallySaleAt: '2026-01-02T10:00:00.000Z',
    tallyRegisterId: 'register-1', tallySessionId: 'session-1', tallyCashierRef: null,
    tallyRejected: false, tallyRejectedClientOrderId: null,
  },
};
const orders = { items: [summary], totalItems: 10 };
const detail: VendureOrder = {
  ...summary, active: false, subTotal: 1000, subTotalWithTax: 1200, shipping: 0, shippingWithTax: 0,
  lines: [{
    id: 'line-1', quantity: 2, taxRate: 20, productVariant: { id: 'variant-1', name: 'Coffee', sku: 'COFFEE' },
    unitPrice: 600, unitPriceWithTax: 720, linePrice: 1200, linePriceWithTax: 1440,
    discountedLinePrice: 1000, discountedLinePriceWithTax: 1200,
    discounts: [{ description: 'Promotion', amount: -200, amountWithTax: -240 }],
    customFields: {
      tallyCustomName: null, tallyCustomSku: null, tallyUnitPrice: 600,
      tallyPriceIncludesTax: false, tallyClientLineId: 'client-line-1',
    },
  }],
  shippingLines: [{ shippingMethod: { name: 'Collection' }, price: 0, priceWithTax: 0 }],
  surcharges: [{ description: 'Service', sku: 'SERVICE', price: 0, priceWithTax: 0 }],
  taxSummary: [{ description: 'Standard', taxRate: 20, taxBase: 1000, taxTotal: 200 }],
  discounts: [{ description: 'Promotion', amount: -200, amountWithTax: -240 }],
  couponCodes: ['COFFEE'],
  payments: [{
    id: 'payment-1', method: 'cash', amount: 1200, state: 'Settled', transactionId: '',
    createdAt: '2026-01-02T10:00:00.000Z', metadata: { tendered: 1500, change: 300 },
    refunds: [{ id: 'refund-1', total: 600, state: 'Settled', reason: 'Return', lines: [{ orderLineId: 'line-1', quantity: 1 }] }],
  }],
  fulfillments: [{ id: 'fulfillment-1', state: 'Delivered', method: 'collection', trackingCode: '' }],
  customFields: { ...summary.customFields!, tallyPayments: '[{"method":"cash"}]', tallySnapshot: '{"version":1}', tallyShipping: null },
};

afterEach(() => vi.restoreAllMocks());

describe('Vendure orders', () => {
  it('sends the default list with context headers and returns the Vendure rows unchanged', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ data: { orders } }));
    await expect(listVendureOrders(context)).resolves.toStrictEqual(orders);
    expect(spy).toHaveBeenCalledExactlyOnceWith(`${context.baseUrl}/admin-api`, expect.objectContaining({
      method: 'POST', headers: { 'Content-Type': 'application/json', ...context.headers }, signal: context.signal,
    }));
    const sent = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(sent.variables).toStrictEqual({ options: {
      skip: 0, take: 25, sort: { orderPlacedAt: 'DESC', id: 'DESC' }, filter: { orderPlacedAt: { isNull: false } },
    } });
    expect(Object.keys(sent.variables.options.sort)).toEqual(['orderPlacedAt', 'id']);
    expect(sent.query.replace(/\s+/g, ' ').trim()).toBe(
      'query Orders($options: OrderListOptions) { orders(options: $options) { items { id code state orderPlacedAt updatedAt currencyCode totalQuantity total totalWithTax customer { id firstName lastName emailAddress } customFields { tallyClientOrderId tallySaleAt tallyRegisterId tallySessionId tallyCashierRef tallyRejected tallyRejectedClientOrderId } } totalItems } }',
    );
  });

  it('sends every filter with only the specified keys', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ data: { customer: { orders } } }));
    const between = { start: '2020-01-01T00:00:00.000Z', end: '2100-01-01T00:00:00.000Z' };
    await listVendureOrders(context, {
      skip: 10, take: 2, orderPlacedAt: { between }, state: ['PaymentSettled', 'Shipped'],
      tallyRegisterId: 'register-1', tallyCashierRef: 'cashier-1', customerId: '1', search: '  Lovelace  ', tallyFields: true,
    });
    expect(JSON.parse(spy.mock.calls[0]![1]!.body as string).variables).toStrictEqual({
      customerId: '1', options: {
        skip: 10, take: 2, sort: { orderPlacedAt: 'DESC', id: 'DESC' },
        filter: {
          orderPlacedAt: { between }, state: { in: ['PaymentSettled', 'Shipped'] },
          tallyRegisterId: { eq: 'register-1' }, tallyCashierRef: { eq: 'cashier-1' },
          _or: [{ code: { contains: 'Lovelace' } }, { customerLastName: { contains: 'Lovelace' } }],
        },
      },
    });
  });

  it('sends only the set date keys and excludes unplaced orders for an empty date filter', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const after = '2026-01-01T00:00:00.000Z';
    const before = '2026-02-01T00:00:00.000Z';
    const between = { start: after, end: before };
    const cases = [
      [{ after }, { after }],
      [{}, { isNull: false }],
      [{ before }, { before }],
      [{ after, before, between }, { after, before, between }],
      [{ after, before: undefined, eq: before }, { after }],
    ] as const;
    for (const [orderPlacedAt, expected] of cases) {
      spy.mockResolvedValueOnce(Response.json({ data: { orders } }));
      await listVendureOrders(context, { orderPlacedAt });
      expect(JSON.parse(spy.mock.calls.at(-1)![1]!.body as string).variables.options.filter)
        .toStrictEqual({ orderPlacedAt: expected });
    }
  });

  it('clamps page sizes and truncates and floors the offset', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    for (const [take, skip, expectedTake, expectedSkip] of [
      [500, -5, 100, 0], [0, 2.9, 1, 2], [25, -0.5, 25, 0],
      [2.7, 0, 2, 0], [NaN, 0, 25, 0], [25, Infinity, 25, 0],
    ]) {
      spy.mockResolvedValueOnce(Response.json({ data: { orders } }));
      await listVendureOrders(context, { take, skip });
      expect(JSON.parse(spy.mock.calls.at(-1)![1]!.body as string).variables.options)
        .toMatchObject({ take: expectedTake, skip: expectedSkip });
    }
  });

  it('omits blank search, empty states and empty register and cashier filters', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    for (const search of ['', ' \t ']) {
      spy.mockResolvedValueOnce(Response.json({ data: { orders } }));
      await listVendureOrders(context, { search, state: [], tallyRegisterId: '', tallyCashierRef: '', customerId: '' });
      const sent = JSON.parse(spy.mock.calls.at(-1)![1]!.body as string);
      expect(sent.variables.options.filter).toStrictEqual({ orderPlacedAt: { isNull: false } });
      expect(sent.variables).not.toHaveProperty('customerId');
      expect(sent.query).not.toContain('customer(id:');
    }
  });

  it('routes customer lists through customer orders and treats a null customer as empty', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ data: { customer: { orders } } }))
      .mockResolvedValueOnce(Response.json({ data: { customer: null } }));
    await expect(listVendureOrders(context, { customerId: '1' })).resolves.toStrictEqual(orders);
    await expect(listVendureOrders(context, { customerId: 'missing', tallyFields: false }))
      .resolves.toStrictEqual({ items: [], totalItems: 0 });
    const sent = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(sent.variables.customerId).toBe('1');
    expect(sent.query).toContain('customer(id: $customerId)');
    expect(sent.query).toContain('orders(options: $options)');
    expect(sent.query).toContain('customFields');
    const missing = JSON.parse(spy.mock.calls[1]![1]!.body as string);
    expect(missing.variables.customerId).toBe('missing');
    expect(missing.query).toContain('customer(id: $customerId)');
    expect(missing.query).not.toContain('customFields');
  });

  it('selects tally fields by default and omits them when disabled', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ data: { orders } }))
      .mockResolvedValueOnce(Response.json({ data: { orders } }));
    await listVendureOrders(context);
    await listVendureOrders(context, { tallyFields: false });
    const defaultQuery = JSON.parse(spy.mock.calls[0]![1]!.body as string).query;
    const plainQuery = JSON.parse(spy.mock.calls[1]![1]!.body as string).query;
    expect(defaultQuery).toContain('tallyRegisterId');
    expect(defaultQuery).toContain('customFields');
    expect(plainQuery).not.toContain('tallyRegisterId');
    expect(plainQuery).not.toContain('customFields');
  });

  it('selects the exact detail fields and keeps refunds when tally fields are disabled', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ data: { order: detail } }))
      .mockResolvedValueOnce(Response.json({ data: { order: detail } }));
    await getVendureOrder(context, '12');
    await getVendureOrder(context, '12', { tallyFields: false });
    const sent = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    const plain = JSON.parse(spy.mock.calls[1]![1]!.body as string);
    expect(sent.variables).toStrictEqual({ id: '12' });
    expect(plain.variables).toStrictEqual({ id: '12' });
    const expected = `query Order($id: ID!) { order(id: $id) {
      id code state active orderPlacedAt updatedAt currencyCode totalQuantity
      customer { id firstName lastName emailAddress }
      lines {
        id quantity taxRate productVariant { id name sku }
        unitPrice unitPriceWithTax linePrice linePriceWithTax discountedLinePrice discountedLinePriceWithTax
        discounts { description amount amountWithTax }
      }
      shippingLines { shippingMethod { name } price priceWithTax }
      surcharges { description sku price priceWithTax }
      subTotal subTotalWithTax shipping shippingWithTax total totalWithTax
      taxSummary { description taxRate taxBase taxTotal }
      discounts { description amount amountWithTax }
      couponCodes
      payments { id method amount state transactionId createdAt metadata refunds { id total state reason lines { orderLineId quantity } } }
      fulfillments { id state method trackingCode }
    } }`;
    expect(plain.query.replace(/\s+/g, ' ').trim()).toBe(expected.replace(/\s+/g, ' ').trim());
    expect(plain.query).not.toContain('customFields');
    expect(plain.query).toContain('refunds');
    expect(sent.query).toContain('tallySnapshot');
    expect(sent.query).toContain('tallyClientLineId');
    expect(sent.query).toContain('refunds');
    expect(sent.query).toContain('orderLineId');
    expect(sent.query).toMatch(/lines\s*{\s*customFields\s*{ tallyCustomName tallyCustomSku tallyUnitPrice tallyPriceIncludesTax tallyClientLineId }/);
    expect(sent.query).toContain('customFields { tallyClientOrderId tallySaleAt tallyRegisterId tallySessionId tallyCashierRef tallyRejected tallyRejectedClientOrderId tallyPayments tallySnapshot tallyShipping }');
  });

  it('returns detail results unchanged or null and rejects malformed orders', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ data: { order: detail } }))
      .mockResolvedValueOnce(Response.json({ data: { order: null } }));
    await expect(getVendureOrder(context, '12')).resolves.toStrictEqual(detail);
    await expect(getVendureOrder(context, 'missing')).resolves.toBeNull();
    for (const order of [{}, { id: 12 }, '12', undefined]) {
      spy.mockResolvedValueOnce(Response.json({ data: { order } }));
      await expect(getVendureOrder(context, '12')).rejects.toThrow('Vendure sent an unexpected order response');
    }
  });

  it('rejects a list without totalItems and other malformed list responses', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    for (const result of [{ items: [] }, { items: {}, totalItems: 0 }, { items: [], totalItems: '0' }, null, undefined]) {
      spy.mockResolvedValueOnce(Response.json({ data: { orders: result } }));
      await expect(listVendureOrders(context)).rejects.toThrow('Vendure sent an unexpected orders response');
    }
    spy.mockResolvedValueOnce(Response.json({ data: { customer: {} } }));
    await expect(listVendureOrders(context, { customerId: '1' })).rejects.toThrow('Vendure sent an unexpected orders response');
  });

  it('propagates FORBIDDEN as status 403 when the second fetch finds the administrator', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ errors: [{ message: 'Forbidden', path: ['orders'], extensions: { code: 'FORBIDDEN' } }] }))
      .mockResolvedValueOnce(Response.json({ data: { activeAdministrator: { id: '1' } } }));
    const result = listVendureOrders(context);
    await expect(result).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
    await expect(result).rejects.toMatchObject({ status: 403 });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(JSON.parse(spy.mock.calls[1]![1]!.body as string).query).toContain('activeAdministrator');
  });
});

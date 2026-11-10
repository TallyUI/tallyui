import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError, type StoreOrder } from '@tallyui/core';
import { createVendureConnector } from './index';
import type { VendureOrder } from './orders';
import { createVendureOrders, toVendureStoreOrder } from './store-orders';

const context = {
  connectorId: 'vendure', baseUrl: 'https://vendure.test',
  headers: { Authorization: 'Bearer admin-token', 'vendure-token': 'channel-token' },
  signal: new AbortController().signal,
};
const fixture: VendureOrder = {
  id: '12', code: 'ORDER-12', state: 'PaymentSettled', active: false,
  orderPlacedAt: '2026-01-02T11:00:00.000+01:00', updatedAt: '2026-01-02T10:01:00.000Z',
  currencyCode: 'USD', totalQuantity: 3, total: 1500, totalWithTax: 1749,
  customer: { id: '1', firstName: 'Ada', lastName: 'Lovelace', emailAddress: 'ada@example.com' },
  customFields: {
    tallyClientOrderId: 'client-12', tallySaleAt: '2026-01-02T10:00:00.000Z',
    tallyRegisterId: 'register-1', tallySessionId: 'session-1', tallyCashierRef: null,
    tallyRejected: false, tallyRejectedClientOrderId: null,
    tallyPayments: null, tallySnapshot: null, tallyShipping: null,
  },
  lines: [{
    id: 'line-1', quantity: 2, orderPlacedQuantity: 2, taxRate: 20,
    productVariant: { id: 'variant-1', name: 'Coffee', sku: 'COFFEE' },
    proratedUnitPrice: 450, proratedUnitPriceWithTax: 540, proratedLinePrice: 900, proratedLinePriceWithTax: 1080,
    unitPrice: 600, unitPriceWithTax: 720, linePrice: 1200, linePriceWithTax: 1440,
    discountedLinePrice: 1000, discountedLinePriceWithTax: 1200,
    discounts: [{ description: 'Line promotion', amount: -200, amountWithTax: -240 }],
    customFields: {
      tallyCustomName: 'Till coffee', tallyCustomSku: 'TILL-COFFEE', tallyUnitPrice: 600,
      tallyPriceIncludesTax: false, tallyClientLineId: 'client-line-1',
    },
  }, {
    id: 'line-2', quantity: 1, orderPlacedQuantity: 1, taxRate: 7.25,
    productVariant: { id: 'variant-2', name: 'Tea', sku: 'TEA' },
    proratedUnitPrice: 400, proratedUnitPriceWithTax: 429, proratedLinePrice: 400, proratedLinePriceWithTax: 429,
    unitPrice: 400, unitPriceWithTax: 429, linePrice: 400, linePriceWithTax: 429,
    discountedLinePrice: 400, discountedLinePriceWithTax: 429, discounts: [],
    customFields: {
      tallyCustomName: null, tallyCustomSku: null, tallyUnitPrice: null,
      tallyPriceIncludesTax: null, tallyClientLineId: 'client-line-2',
    },
  }],
  shippingLines: [{ shippingMethod: { name: 'Delivery' }, price: 200, priceWithTax: 240, discountedPrice: 100, discountedPriceWithTax: 120 }],
  surcharges: [{ description: 'Service', sku: 'SERVICE', price: 100, priceWithTax: 120 }],
  subTotal: 1300, subTotalWithTax: 1509, shipping: 100, shippingWithTax: 120,
  taxSummary: [
    { description: 'Standard', taxRate: 20, taxBase: 1100, taxTotal: 220 },
    { description: 'Reduced', taxRate: 7.25, taxBase: 400, taxTotal: 29 },
  ],
  discounts: [{ description: 'Promotion', amount: -400, amountWithTax: -480 }],
  couponCodes: ['COFFEE'],
  payments: [{
    id: 'payment-1', method: 'cash', amount: 1500, state: 'Settled', transactionId: '',
    createdAt: '2026-01-02T10:00:00.000Z', metadata: {},
    refunds: [
      { id: 'refund-1', total: 600, items: 600, shipping: 0, adjustment: 0, state: 'Settled', reason: 'Return', metadata: {}, lines: [{ orderLineId: 'line-1', quantity: 1 }] },
      { id: 'refund-2', total: 120, items: 0, shipping: 120, adjustment: 0, state: 'Pending', reason: '', metadata: {}, lines: [] },
      { id: 'refund-3', total: 240, items: 240, shipping: 0, adjustment: 0, state: 'Failed', reason: 'Failed return', metadata: {}, lines: [] },
    ],
  }, {
    id: 'payment-2', method: 'card', amount: 249, state: 'Authorized', transactionId: 'card-1',
    createdAt: '2026-01-02T10:00:00.000Z', metadata: {}, refunds: [],
  }, {
    id: 'payment-3', method: 'declined-card', amount: 1749, state: 'Declined', transactionId: '',
    createdAt: '2026-01-02T10:00:00.000Z', metadata: {}, refunds: [],
  }],
};
const plainFixture: VendureOrder = {
  id: '20', code: 'ORDER-20', state: 'PaymentSettled', active: false,
  orderPlacedAt: '2026-01-03T10:00:00.000Z', updatedAt: '2026-01-03T10:01:00.000Z',
  currencyCode: 'USD', totalQuantity: 1, total: 100, totalWithTax: 120, customer: null,
  lines: [{
    id: 'line-20', quantity: 1, orderPlacedQuantity: 1, taxRate: 20,
    productVariant: { id: 'variant-20', name: 'Coffee', sku: '' },
    proratedUnitPrice: 100, proratedUnitPriceWithTax: 120, proratedLinePrice: 100, proratedLinePriceWithTax: 120,
    unitPrice: 100, unitPriceWithTax: 120, linePrice: 100, linePriceWithTax: 120,
    discountedLinePrice: 100, discountedLinePriceWithTax: 120, discounts: [],
  }],
  shippingLines: [], surcharges: [], subTotal: 100, subTotalWithTax: 120, shipping: 0, shippingWithTax: 0,
  taxSummary: [{ description: 'Standard', taxRate: 20, taxBase: 100, taxTotal: 20 }],
  discounts: [], couponCodes: [],
};

afterEach(() => vi.restoreAllMocks());

describe('Vendure store orders', () => {
  it('maps a till order with plugin fields', () => {
    const expected: StoreOrder = {
      id: '12', reference: 'ORDER-12', clientOrderId: 'client-12', status: 'PaymentSettled',
      placedAt: '2026-01-02T10:00:00.000Z', currency: 'USD', pricesIncludeTax: false,
      customer: { id: '1', name: 'Ada Lovelace', email: 'ada@example.com' },
      lines: [{
        id: 'line-1', clientLineId: 'client-line-1', variantId: 'variant-1', name: 'Till coffee', sku: 'TILL-COFFEE',
        quantity: 2, subtotalMinor: 1200, subtotalTaxMinor: 240, totalMinor: 900, taxMinor: 180,
      }, {
        id: 'line-2', clientLineId: 'client-line-2', variantId: 'variant-2', name: 'Tea', sku: 'TEA',
        quantity: 1, subtotalMinor: 400, subtotalTaxMinor: 29, totalMinor: 400, taxMinor: 29,
      }],
      fees: [{ name: 'Service', totalMinor: 100, taxMinor: 20 }],
      shipping: [{ name: 'Delivery', totalMinor: 100, taxMinor: 20 }],
      coupons: [],
      taxLines: [
        { label: 'Standard', ratePpm: 200000, amountMinor: 220 },
        { label: 'Reduced', ratePpm: 72500, amountMinor: 29 },
      ],
      discountMinor: 400, discountTaxMinor: 80, taxMinor: 249, totalMinor: 1749,
      payments: [{ method: 'cash', amountMinor: 1500 }, { method: 'card', amountMinor: 249 }],
      refunds: [{ id: 'refund-1', amountMinor: 600, reason: 'Return' }, { id: 'refund-2', amountMinor: 120 }],
    };
    expect(toVendureStoreOrder(fixture, false)).toStrictEqual(expected);
  });

  it('maps an order without plugin fields', () => {
    const result = toVendureStoreOrder(plainFixture, false);
    expect(result).not.toHaveProperty('clientOrderId');
    expect(result.lines[0]).not.toHaveProperty('clientLineId');
    expect(result.lines[0]).not.toHaveProperty('sku');
    expect(result.customer).toBeNull();
    expect(result.payments).toStrictEqual([]);
    expect(result.refunds).toStrictEqual([]);
    expect(Object.is(result.discountMinor, 0)).toBe(true);
    expect(Object.is(result.discountTaxMinor, 0)).toBe(true);
  });

  it('rejects an order that was never placed or has a bad date', () => {
    for (const orderPlacedAt of [null, 'not a date']) {
      expect(() => toVendureStoreOrder({ ...fixture, orderPlacedAt }, false)).toThrow('Vendure sent an unexpected order response');
    }
  });

  it('lists the first page newest first with detail fields', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ data: { orders: { items: [fixture], totalItems: 10 } } }));
    await expect(createVendureOrders().listOrders(context)).resolves.toStrictEqual({ orders: [toVendureStoreOrder(fixture, false)], hasMore: true });
    const sent = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(sent.variables).toStrictEqual({ options: {
      skip: 0, take: 25, sort: { orderPlacedAt: 'DESC', id: 'DESC' }, filter: { orderPlacedAt: { isNull: false } },
    } });
    expect(sent.query).toContain('proratedLinePrice');
    expect(sent.query).toContain('tallyClientOrderId');
  });

  it('pages, clamps and searches', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ data: { orders: { items: [fixture], totalItems: 21 } } }))
      .mockResolvedValueOnce(Response.json({ data: { orders: { items: Array.from({ length: 10 }, () => fixture), totalItems: 21 } } }));
    const { listOrders } = createVendureOrders();
    await expect(listOrders(context, { page: 3, perPage: 10 })).resolves.toStrictEqual({ orders: [toVendureStoreOrder(fixture, false)], hasMore: false });
    expect(JSON.parse(spy.mock.calls[0]![1]!.body as string).variables.options).toMatchObject({ skip: 20, take: 10 });
    expect((await listOrders(context, { page: 2, perPage: 10 })).hasMore).toBe(true);
    expect(JSON.parse(spy.mock.calls[1]![1]!.body as string).variables.options).toMatchObject({ skip: 10, take: 10 });
    for (const [perPage, take] of [[500, 100], [0, 1], [2.7, 2]]) {
      spy.mockResolvedValueOnce(Response.json({ data: { orders: { items: [], totalItems: 0 } } }));
      await listOrders(context, { perPage });
      expect(JSON.parse(spy.mock.calls.at(-1)![1]!.body as string).variables.options.take).toBe(take);
    }
    for (const page of [0, -2, NaN]) {
      spy.mockResolvedValueOnce(Response.json({ data: { orders: { items: [], totalItems: 0 } } }));
      await listOrders(context, { page });
      expect(JSON.parse(spy.mock.calls.at(-1)![1]!.body as string).variables.options.skip).toBe(0);
    }
    spy.mockResolvedValueOnce(Response.json({ data: { orders: { items: [], totalItems: 0 } } }));
    await listOrders(context, { search: '  ORD ' });
    expect(JSON.parse(spy.mock.calls.at(-1)![1]!.body as string).variables.options.filter._or).toStrictEqual([
      { code: { contains: 'ORD' } }, { customerLastName: { contains: 'ORD' } },
    ]);
    spy.mockResolvedValueOnce(Response.json({ data: { orders: { items: [], totalItems: 0 } } }));
    await listOrders(context, { search: ' ' });
    expect(JSON.parse(spy.mock.calls.at(-1)![1]!.body as string).variables.options.filter).not.toHaveProperty('_or');
  });

  it('reads without plugin fields and applies the channel tax setting', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ data: { orders: { items: [plainFixture], totalItems: 1 } } }))
      .mockResolvedValueOnce(Response.json({ data: { order: plainFixture } }))
      .mockResolvedValueOnce(Response.json({ data: { orders: { items: [fixture], totalItems: 1 } } }));
    const orders = createVendureOrders({ tallyFields: false, pricesIncludeTax: true });
    expect((await orders.listOrders(context)).orders[0]!.pricesIncludeTax).toBe(true);
    expect((await orders.getOrders(context, ['20']))[0]!.pricesIncludeTax).toBe(true);
    for (const call of spy.mock.calls) expect(JSON.parse(call[1]!.body as string).query).not.toContain('customFields');
    expect((await createVendureOrders().listOrders(context)).orders[0]!.pricesIncludeTax).toBe(false);
  });

  it('gets orders one by one in the order asked', async () => {
    const order13: VendureOrder = { ...fixture, id: '13', code: 'ORDER-13' };
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ data: { order: order13 } }))
      .mockResolvedValueOnce(Response.json({ data: { order: fixture } }))
      .mockResolvedValueOnce(Response.json({ data: { order: null } }))
      .mockResolvedValueOnce(Response.json({ data: { order: { ...fixture, id: 'cart', orderPlacedAt: null } } }));
    const { getOrders } = createVendureOrders();
    await expect(getOrders(context, ['13', '12', 'missing', '13', '', 'cart'])).resolves.toStrictEqual([
      toVendureStoreOrder(order13, false), toVendureStoreOrder(fixture, false),
    ]);
    expect(spy).toHaveBeenCalledTimes(4);
    expect(spy.mock.calls.map((call) => JSON.parse(call[1]!.body as string).variables)).toStrictEqual([
      { id: '13' }, { id: '12' }, { id: 'missing' }, { id: 'cart' },
    ]);
    spy.mockClear();
    await expect(getOrders(context, [])).resolves.toStrictEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('propagates FORBIDDEN as ConnectorUnauthorizedError', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ errors: [{ message: 'Forbidden', path: ['orders'], extensions: { code: 'FORBIDDEN' } }] }))
      .mockResolvedValueOnce(Response.json({ data: { activeAdministrator: { id: '1' } } }));
    const result = createVendureOrders().listOrders(context);
    await expect(result).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
    await expect(result).rejects.toMatchObject({ status: 403 });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('wires order history into the connector', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ data: { orders: { items: [plainFixture], totalItems: 1 } } }));
    const connector = createVendureConnector({ pricesIncludeTax: true, tallyFields: false });
    expect(connector.listOrders).toBeTypeOf('function');
    expect(connector.getOrders).toBeTypeOf('function');
    expect((await connector.listOrders!(context)).orders[0]!.pricesIncludeTax).toBe(true);
    expect(JSON.parse(spy.mock.calls[0]![1]!.body as string).query).not.toContain('customFields');
  });
});

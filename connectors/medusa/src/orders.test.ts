import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError, CustomerServiceError, UnsupportedOrderFilterError, type StoreOrder, type SyncContext } from '@tallyui/core';
import { createMedusaOrders, MEDUSA_ORDER_FILTERS, medusaOrderFilters, ORDER_FIELDS, toMedusaStoreOrder } from './orders';
import { medusaMinor, medusaSumMinor } from './money';
import { createMedusaAdminUserConnector } from './index';
import fixture from './orders.fixture.json';
import refundLinesFixture from './orders-refund-lines.fixture.json';

const baseUrl = 'https://medusa.test';
const headers = { Authorization: 'Bearer admin-token' };
const context: SyncContext = { connectorId: 'medusa', baseUrl, headers };
const L = fixture.list.body.orders;
const detail = fixture.detail.body.order;
const response = (entry: { status: number; body: unknown }) => new Response(JSON.stringify(entry.body), { status: entry.status });
const listOf = (orders: unknown[]) => response({ status: 200, body: { ...fixture.list.body, orders } });
const sentParams = (spy: { mock: { lastCall?: unknown[] } }) => new URL(String(spy.mock.lastCall?.[0])).searchParams;
const { listOrders, getOrders } = createMedusaOrders();

const tillOrder: StoreOrder = {
  id: 'order_01M7TS1DZZRM0D7RZ5S5WRD1JS',
  reference: '305',
  clientOrderId: '0199f540-0000-7000-8000-00000000bbbb',
  status: 'completed',
  placedAt: '2026-11-19T20:47:44.640Z',
  currency: 'EUR',
  pricesIncludeTax: false,
  customer: { id: 'cus_01M7TS1DZ4DN75JBZM2HBJGBWH', email: 'till-b@example.test' },
  lines: [
    {
      id: 'ordli_01M7TS1E00M859JB5BNYS49J32', clientLineId: '0199f540-0000-7000-8000-00000000b001',
      productId: 'prod_01M35QWE8VPHP03ST5P0M2YKKR', variantId: 'variant_01M35QWENHRZW4M1V6J9C1HX89',
      name: 'Tarnwell Classic Joggers', sku: 'TLY-00004-L', quantity: 1,
      subtotalMinor: 5699, subtotalTaxMinor: 1083, totalMinor: 5129, taxMinor: 975,
    },
    {
      id: 'ordli_01M7TS1E009FVGAKAB7AAMY0KK', clientLineId: '0199f540-0000-7000-8000-00000000b002',
      productId: 'prod_01M35QXQ67KS0S57WV693E0JMA', variantId: 'variant_01M35QXQ7SCEG8GP5Q7EAMV65Y',
      name: 'Fixture Mug', sku: 'TLY-FIXTURE-MUG', quantity: 3,
      subtotalMinor: 3600, subtotalTaxMinor: 684, totalMinor: 3600, taxMinor: 684,
    },
  ],
  fees: [],
  shipping: [
    { id: 'ordsm_01M7TS23XR0J1GFB0YN67ED588', name: 'Express Shipping', totalMinor: 750, taxMinor: 143, methodId: 'so_01M35QW1EZCRFSXM2S7FYABYEX' },
  ],
  coupons: [],
  taxLines: [{ label: 'FIX540 DE VAT 19%', code: 'FIX540-DE19', ratePpm: 190000, amountMinor: 1801 }],
  discountMinor: 570,
  discountTaxMinor: 108,
  taxMinor: 1801,
  totalMinor: 11280,
  payments: [{ id: 'pay_01M7TS2D7ZNGSWY0F0X1HP55M8', method: 'pp_system_default', amountMinor: 11280 }],
  refunds: [
    { id: 'ref_01M7TS2QXJ9G73JM62903BWGMX', amountMinor: 500, reason: 'FIX540 partial refund' },
    { id: 'ref_01M7TS4Z49RBMAZDBWNVNZ08Q0', amountMinor: 100 },
  ],
};

describe('Medusa order history', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps a recorded till order', () => {
    expect(toMedusaStoreOrder(L[0])).toStrictEqual(tillOrder);
  });

  it('maps the detail order', () => {
    const order = toMedusaStoreOrder(detail);
    expect(order.totalMinor).toBe(8917);
    expect(order.taxMinor).toBe(1424);
    expect(order.customer).toStrictEqual({ id: 'cus_01M7TS0NMFFKEEFV37EFZGQDXJ', email: 'till-a@example.test' });
    expect(order.customer).not.toHaveProperty('name');
    expect(order.payments).toStrictEqual([{ id: 'pay_01M7TS132MWC516ZVPQ3RKB6S0', method: 'pp_system_default', amountMinor: 8917 }]);
  });

  it('upholds net + tax = gross rounded once', () => {
    for (const raw of [...L, detail]) {
      const order = toMedusaStoreOrder(raw);
      const credit = 'credit_line_total' in raw ? raw.credit_line_total : 0;
      expect(order.totalMinor).toBe(medusaSumMinor('EUR', [raw.total, credit ?? 0]));
      raw.items.forEach((item, index) => {
        const line = order.lines[index]!;
        expect(line.totalMinor + line.taxMinor).toBe(medusaMinor(item.total, 'EUR'));
        expect(line.subtotalMinor + line.subtotalTaxMinor).toBe(medusaMinor(item.original_total, 'EUR'));
      });
    }
  });

  it('leaves clientOrderId out of an order without tally metadata', () => {
    const order = toMedusaStoreOrder(L[2]);
    expect('clientOrderId' in order).toBe(false);
    expect(order.lines.length).toBeGreaterThan(0);
    for (const line of order.lines) expect('clientLineId' in line).toBe(false);
    expect(order.customer).toStrictEqual({ id: 'cus_01M35QXY6XM3R6ZCBECGEJ2B7H', name: 'Liam Cohen', email: 'customer1060@example.test' });
  });

  it('reads the inclusive flag from the items', () => {
    const inclusive = structuredClone(L[1]);
    for (const item of inclusive.items) item.is_tax_inclusive = true;
    expect(toMedusaStoreOrder(inclusive).pricesIncludeTax).toBe(true);
    const mixed = structuredClone(L[1]);
    mixed.items[0]!.is_tax_inclusive = true;
    expect(toMedusaStoreOrder(mixed).pricesIncludeTax).toBe(false);
    expect(toMedusaStoreOrder(L[1]).pricesIncludeTax).toBe(false);
  });

  it('ignores credit lines that are absent', async () => {
    expect('credit_line_total' in L[1]).toBe(false);
    expect(toMedusaStoreOrder(L[1]).totalMinor).toBe(8917);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(listOf([L[0], { ...structuredClone(L[1]), credit_line_total: 'x' }, L[2]]));
    const page = await listOrders(context);
    expect(page.orders.map((order) => order.id)).toEqual([L[0].id, L[2].id]);
    expect(page.unreadable).toBe(1);
  });

  it('lists newest first with paging and count', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(fixture.list));
    const page = await listOrders(context, { page: 2, perPage: 3 });
    const url = new URL(String(spy.mock.lastCall?.[0]));
    expect(`${url.origin}${url.pathname}`).toBe(`${baseUrl}/admin/orders`);
    expect(spy.mock.lastCall?.[1]).toMatchObject({ method: 'GET', headers });
    const params = url.searchParams;
    expect(params.get('limit')).toBe('3');
    expect(params.get('offset')).toBe('3');
    expect(params.get('order')).toBe('-created_at');
    expect(params.get('fields')).toBe(ORDER_FIELDS);
    expect(page.total).toBe(fixture.list.body.count);
    expect(page.hasMore).toBe(3 + page.orders.length < fixture.list.body.count);
    expect(page.orders).toHaveLength(3);
    expect(page).not.toHaveProperty('unreadable');
  });

  it('sends status, customerId, dateRange and search', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(fixture.list));
    await listOrders(context, {
      status: 'completed', customerId: 'cus_1', dateRange: { after: '2026-11-01T00:00:00.000Z', before: '2026-11-02T00:00:00.000Z' }, search: ' 301 ',
    });
    const params = sentParams(spy);
    expect(params.get('status')).toBe('completed');
    expect(params.get('customer_id')).toBe('cus_1');
    expect(params.get('created_at[$gte]')).toBe('2026-11-01T00:00:00.000Z');
    expect(params.get('created_at[$lt]')).toBe('2026-11-02T00:00:00.000Z');
    expect(params.get('q')).toBe('301');
  });

  it('refuses unsupported filters without a request', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no request expected'));
    const refusal = listOrders(context, { registerId: 'r1', paymentMethod: 'cash' });
    await expect(refusal).rejects.toBeInstanceOf(UnsupportedOrderFilterError);
    await expect(refusal).rejects.toMatchObject({ fields: ['registerId', 'paymentMethod'] });
    expect(spy).not.toHaveBeenCalled();
  });

  it('an empty status resolves an empty page without a request', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no request expected'));
    await expect(listOrders(context, { status: '' })).resolves.toStrictEqual({ orders: [], hasMore: false });
    expect(spy).not.toHaveBeenCalled();
  });

  it('counts an unreadable order and keeps the rest', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(listOf([L[0], { ...structuredClone(L[1]), created_at: 'nope' }, L[2]]));
    const page = await listOrders(context);
    expect(page.orders).toHaveLength(L.length - 1);
    expect(page.unreadable).toBe(1);
  });

  it('getOrders keeps the asked order and leaves out a 404', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response({ status: 200, body: { order: L[0] } }))
      .mockResolvedValueOnce(response(fixture.missing))
      .mockResolvedValueOnce(response(fixture.detail));
    const orders = await getOrders(context, [L[0].id, 'order_missing', detail.id, L[0].id]);
    expect(orders.map((order) => order.id)).toEqual([L[0].id, detail.id]);
    expect(spy).toHaveBeenCalledTimes(3);
    const first = new URL(String(spy.mock.calls[0]?.[0]));
    expect(`${first.origin}${first.pathname}`).toBe(`${baseUrl}/admin/orders/${L[0].id}`);
    expect(first.searchParams.get('fields')).toBe(ORDER_FIELDS);
  });

  it('maps credentials and server failures', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    spy.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    await expect(listOrders(context)).rejects.toSatisfy((error) => error instanceof ConnectorUnauthorizedError && error.status === 401);
    spy.mockResolvedValueOnce(new Response('{}', { status: 500 }));
    await expect(getOrders(context, ['order_1'])).rejects.toSatisfy((error) => error instanceof CustomerServiceError && error.code === 'server');
    spy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(listOrders(context)).rejects.toSatisfy((error) => error instanceof CustomerServiceError && error.code === 'network');
  });

  it('the admin-user connector carries order history', () => {
    const connector = createMedusaAdminUserConnector();
    expect(connector.orderFilters).toEqual(['status', 'customerId', 'dateRange']);
    expect(typeof connector.listOrders).toBe('function');
    expect(typeof connector.getOrders).toBe('function');
  });
});

describe('Medusa order history through the plugin orders route (#1114)', () => {
  afterEach(() => vi.restoreAllMocks());

  const ctx2: SyncContext = { ...context, capabilities: { orderCreate: 1, pluginContract: 2 } };
  const ctx3: SyncContext = { ...context, capabilities: { orderCreate: 1, pluginContract: 3 } };
  const ctx4: SyncContext = { ...context, capabilities: { orderCreate: 1, pluginContract: 4 } };
  const X = L[0];
  const Y = L[2];
  const pluginOf = (ids: string[], extra: Record<string, unknown> = { hasMore: false }) =>
    response({ status: 200, body: { orders: ids.map((id) => ({ id, displayId: 1 })), ...extra } });
  const call = (spy: { mock: { calls: unknown[][] } }, index: number) => new URL(String(spy.mock.calls[index]?.[0]));
  const path = (url: URL) => `${url.origin}${url.pathname}`;
  const entries = (url: URL) => [...url.searchParams.entries()];

  it('C1 (#1125) searches display numbers across all channels at contract 4', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(pluginOf([]));
    await listOrders(ctx4, { search: '303' });
    expect(spy).toHaveBeenCalledOnce();
    const url = call(spy, 0);
    expect(path(url)).toBe(`${baseUrl}/tally/v1/orders`);
    expect(entries(url).sort()).toStrictEqual([['allChannels', 'true'], ['page', '1'], ['perPage', '25'], ['search', '303']]);
  });

  it('C2 sends register and customer filters across all channels at contract 4', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(pluginOf([]));
    await listOrders(ctx4, { registerId: 'reg-1', customerId: 'cus_1' });
    expect(spy).toHaveBeenCalledOnce();
    const url = call(spy, 0);
    expect(path(url)).toBe(`${baseUrl}/tally/v1/orders`);
    expect(entries(url).sort()).toStrictEqual([
      ['allChannels', 'true'], ['customerId', 'cus_1'], ['page', '1'], ['perPage', '25'], ['registerId', 'reg-1'],
    ]);
  });

  it.each([{ search: '303' }, { registerId: 'reg-1' }])('C3 omits allChannels at contract 3 for %j', async (query) => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(pluginOf([]));
    await listOrders(ctx3, query);
    expect(spy).toHaveBeenCalledOnce();
    const url = call(spy, 0);
    expect(path(url)).toBe(`${baseUrl}/tally/v1/orders`);
    expect(url.searchParams.has('allChannels')).toBe(false);
  });

  it.each([{ search: 'smith' }, {}])('C4 keeps %j on the admin path without allChannels at contract 4', async (query) => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(fixture.list));
    await listOrders(ctx4, query);
    expect(spy).toHaveBeenCalledOnce();
    const url = call(spy, 0);
    expect(path(url)).toBe(`${baseUrl}/admin/orders`);
    expect(url.searchParams.has('allChannels')).toBe(false);
  });

  it('C5 sends allChannels at contract 5 too', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(pluginOf([]));
    await listOrders({ ...context, capabilities: { orderCreate: 1, pluginContract: 5 } }, { registerId: 'reg-1' });
    expect(spy).toHaveBeenCalledOnce();
    const url = call(spy, 0);
    expect(path(url)).toBe(`${baseUrl}/tally/v1/orders`);
    expect(url.searchParams.get('allChannels')).toBe('true');
  });

  it('N1 offers registerId only at plugin contract 3', () => {
    for (const capabilities of [undefined, { orderCreate: 1 }, { orderCreate: 1, pluginContract: 2 }]) {
      expect(medusaOrderFilters(capabilities)).toStrictEqual(MEDUSA_ORDER_FILTERS);
    }
    expect(medusaOrderFilters({ orderCreate: 1, pluginContract: 3 })).toStrictEqual([...MEDUSA_ORDER_FILTERS, 'registerId']);
  });

  it('N2 refuses a register filter below contract 3 and keeps digit searches on the admin path', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no request expected'));
    await expect(listOrders(ctx2, { registerId: 'reg-1' })).rejects.toBeInstanceOf(UnsupportedOrderFilterError);
    expect(spy).not.toHaveBeenCalled();
    spy.mockResolvedValueOnce(response(fixture.list));
    await listOrders(ctx2, { search: '303' });
    expect(spy).toHaveBeenCalledOnce();
    expect(path(call(spy, 0))).toBe(`${baseUrl}/admin/orders`);
    expect(call(spy, 0).searchParams.get('q')).toBe('303');
  });

  it('N3 picks ids through the route by register and reads the rows in the route order', async () => {
    const after = '2026-11-01T00:00:00.000Z';
    const before = '2026-11-02T00:00:00.000Z';
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(pluginOf([X.id, Y.id], { hasMore: true, total: 12 }))
      .mockResolvedValueOnce(listOf([Y, X]));
    const page = await listOrders(ctx3, { registerId: 'reg-1', status: 'completed', dateRange: { after, before }, page: 2, perPage: 10 });
    expect(spy).toHaveBeenCalledTimes(2);
    const first = call(spy, 0);
    expect(path(first)).toBe(`${baseUrl}/tally/v1/orders`);
    expect(spy.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', headers });
    expect(entries(first).sort()).toStrictEqual([
      ['after', after], ['before', before], ['page', '2'], ['perPage', '10'], ['registerId', 'reg-1'], ['status', 'completed'],
    ]);
    const second = call(spy, 1);
    expect(path(second)).toBe(`${baseUrl}/admin/orders`);
    expect(second.searchParams.getAll('id[]')).toStrictEqual([X.id, Y.id]);
    expect(second.searchParams.get('limit')).toBe('2');
    expect(second.searchParams.get('fields')).toBe(ORDER_FIELDS);
    expect(page).toStrictEqual({ orders: [toMedusaStoreOrder(X), toMedusaStoreOrder(Y)], hasMore: true, total: 12 });
  });

  it.each([
    ['123456', 'plugin', '123456'],
    ['1234567', 'admin', '1234567'],
    ['12a', 'admin', '12a'],
    [' 303 ', 'plugin', '303'],
  ])('N4 search %j takes the %s path', async (search, route, sent) => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(route === 'plugin' ? pluginOf([]) : response(fixture.list));
    await listOrders(ctx3, { search });
    expect(spy).toHaveBeenCalledOnce();
    const url = call(spy, 0);
    if (route === 'plugin') {
      expect(path(url)).toBe(`${baseUrl}/tally/v1/orders`);
      expect(entries(url).sort()).toStrictEqual([['page', '1'], ['perPage', '25'], ['search', sent]]);
    } else {
      expect(path(url)).toBe(`${baseUrl}/admin/orders`);
      expect(url.searchParams.get('q')).toBe(sent);
    }
  });

  it('N5 resolves an empty route answer with one request', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(pluginOf([], { hasMore: false, total: 0 }));
    await expect(listOrders(ctx3, { registerId: 'reg-1' })).resolves.toStrictEqual({ orders: [], hasMore: false, total: 0 });
    spy.mockResolvedValueOnce(pluginOf([]));
    await expect(listOrders(ctx3, { registerId: 'reg-1' })).resolves.toStrictEqual({ orders: [], hasMore: false });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls.every(([url]) => String(url).startsWith(`${baseUrl}/tally/v1/orders?`))).toBe(true);
  });

  it('N5 leaves out and counts an id the admin answer lacks', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(pluginOf([X.id, 'order_gone', Y.id]))
      .mockResolvedValueOnce(listOf([X, Y]));
    const page = await listOrders(ctx3, { registerId: 'reg-1' });
    expect(page.orders.map((order) => order.id)).toStrictEqual([X.id, Y.id]);
    expect(page.unreadable).toBe(1);
  });

  it('N5b an empty route answer to a digit search does not fall through to the admin path', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(pluginOf([])).mockResolvedValue(response(fixture.list));
    await expect(listOrders(ctx3, { search: '303' })).resolves.toStrictEqual({ orders: [], hasMore: false });
    expect(spy).toHaveBeenCalledOnce();
    for (const [url] of spy.mock.calls) {
      expect(String(url)).not.toContain('/admin/orders');
      expect(new URL(String(url)).searchParams.has('q')).toBe(false);
    }
  });

  it('N6 maps route failures without a second request', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    spy.mockResolvedValueOnce(new Response('{}', { status: 403 }));
    await expect(listOrders(ctx3, { registerId: 'reg-1' })).rejects.toSatisfy((error) => error instanceof ConnectorUnauthorizedError && error.status === 403);
    expect(spy).toHaveBeenCalledOnce();
    spy.mockResolvedValueOnce(new Response('{}', { status: 400 }));
    await expect(listOrders(ctx3, { search: '303' })).rejects.toSatisfy((error) => error instanceof CustomerServiceError && error.code === 'invalid');
    spy.mockResolvedValueOnce(response({ status: 200, body: { orders: [{ id: X.id }] } }));
    await expect(listOrders(ctx3, { registerId: 'reg-1' })).rejects.toSatisfy((error) => error instanceof CustomerServiceError && error.code === 'server');
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('N7 keeps a word search on the admin path with today\'s params', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(fixture.list));
    await listOrders(ctx3, { search: 'jane' });
    expect(spy).toHaveBeenCalledOnce();
    const url = call(spy, 0);
    expect(path(url)).toBe(`${baseUrl}/admin/orders`);
    expect(entries(url)).toStrictEqual([['limit', '25'], ['offset', '0'], ['order', '-created_at'], ['fields', ORDER_FIELDS], ['q', 'jane']]);
  });
});

describe('refund lines (#1324)', () => {
  afterEach(() => vi.restoreAllMocks());

  const ctx6: SyncContext = { ...context, capabilities: { orderCreate: 1, pluginContract: 6 } };
  const ctx5: SyncContext = { ...context, capabilities: { orderCreate: 1, pluginContract: 5 } };
  type PluginBody = { orders: { id: string; refunds: { id: string; lines?: Record<string, unknown>[] }[] }[] };
  const pluginBody = () => structuredClone(refundLinesFixture) as PluginBody;
  const fixtureLine = pluginBody().orders[0]!.refunds[0]!.lines![0];
  const adminOf = (order: unknown) => response({ status: 200, body: { order } });
  const plugin = (body: unknown) => response({ status: 200, body });
  const url = (spy: { mock: { calls: unknown[][] } }, index: number) => new URL(String(spy.mock.calls[index]?.[0]));
  const pluginCalls = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.map(([href]) => new URL(String(href))).filter((sent) => sent.pathname === '/tally/v1/orders');

  it('getOrders merges the plugin\'s lines by refund id at contract 6', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(adminOf(L[0])).mockResolvedValueOnce(plugin(refundLinesFixture));
    const [order] = await getOrders(ctx6, [L[0].id]);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(order!.refunds[0]!.lines).toStrictEqual([fixtureLine]);
    expect(order!.refunds[1]).not.toHaveProperty('lines');
    expect(order).toStrictEqual({ ...tillOrder, refunds: [{ ...tillOrder.refunds[0]!, lines: [fixtureLine] }, tillOrder.refunds[1]] });
    const sent = url(spy, 1);
    expect(`${sent.origin}${sent.pathname}`).toBe(`${baseUrl}/tally/v1/orders`);
    expect([...sent.searchParams.entries()].sort()).toStrictEqual([
      ['allChannels', 'true'], ['ids', 'order_01M7TS1DZZRM0D7RZ5S5WRD1JS'], ['page', '1'], ['perPage', '1'],
    ]);
  });

  it.each([['contract 5', ctx5], ['no capabilities', context]])('makes no plugin request below contract 6 (%s)', async (_, ctx) => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(adminOf(L[0])).mockResolvedValue(plugin(refundLinesFixture));
    const orders = await getOrders(ctx, [L[0].id]);
    expect(spy).toHaveBeenCalledOnce();
    expect(orders).toStrictEqual([tillOrder]);
    for (const refund of orders[0]!.refunds) expect(refund).not.toHaveProperty('lines');
  });

  it('asks only for orders with refunds', async () => {
    expect(toMedusaStoreOrder(detail).refunds).toStrictEqual([]);
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(fixture.detail)).mockResolvedValue(plugin(refundLinesFixture));
    await getOrders(ctx6, [detail.id]);
    expect(spy).toHaveBeenCalledOnce();
    expect(pluginCalls(spy)).toHaveLength(0);
  });

  it('chunks ids at 100 per request', async () => {
    const ids = Array.from({ length: 101 }, (_, index) => `order_${String(index).padStart(3, '0')}`);
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (href) => {
      const sent = new URL(String(href));
      if (sent.pathname === '/tally/v1/orders') return plugin({ orders: [] });
      return adminOf({ ...structuredClone(L[0]), id: decodeURIComponent(sent.pathname.split('/').pop()!) });
    });
    const orders = await getOrders(ctx6, ids);
    expect(orders).toHaveLength(101);
    const chunks = pluginCalls(spy);
    expect(chunks).toHaveLength(2);
    const asked = chunks.map((sent) => sent.searchParams.get('ids')!.split(','));
    expect(asked.map((chunk) => chunk.length)).toStrictEqual([100, 1]);
    expect(chunks.map((sent) => sent.searchParams.get('perPage'))).toStrictEqual(['100', '1']);
    expect(chunks.every((sent) => sent.searchParams.getAll('ids').length === 1)).toBe(true);
    expect(asked.flat().sort()).toStrictEqual(ids);
  });

  it.each<[string, () => Promise<Response>]>([
    ['a 500', async () => new Response('{}', { status: 500 })],
    ['a 404', async () => new Response('{}', { status: 404 })],
    ['a network failure', async () => { throw new TypeError('Failed to fetch'); }],
    ['a 200 with {}', async () => plugin({})],
    ['a 200 with non-JSON', async () => new Response('<html>', { status: 200 })],
  ])('degrades to refunds without lines when the plugin read fails (%s)', async (_, answer) => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(adminOf(L[0]));
    const atFive = await getOrders(ctx5, [L[0].id]);
    spy.mockClear().mockResolvedValueOnce(adminOf(L[0])).mockImplementationOnce(answer);
    const orders = await getOrders(ctx6, [L[0].id]);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(orders).toStrictEqual(atFive);
    for (const refund of orders[0]!.refunds) expect(refund).not.toHaveProperty('lines');
  });

  it('a cancelled read still rejects', async () => {
    const controller = new AbortController();
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => {
        controller.abort();
        return adminOf(L[0]);
      })
      .mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
    await expect(getOrders({ ...ctx6, signal: controller.signal }, [L[0].id])).rejects.toBeInstanceOf(CustomerServiceError);
  });

  it.each<Record<string, unknown>>([
    { quantity: 0 }, { quantity: 1.5 }, { netMinor: -1 }, { taxMinor: '80' }, { orderLineId: '' }, { orderLineId: 'ordli_not_on_this_order' },
  ])('drops a refund\'s lines when any line is malformed (%j)', async (patch) => {
    const body = pluginBody();
    const refund = body.orders[0]!.refunds[0]!;
    refund.lines = [{ ...refund.lines![0], orderLineId: 'ordli_01M7TS1E00M859JB5BNYS49J32' }, { ...refund.lines![0], ...patch }];
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(adminOf(L[0])).mockResolvedValueOnce(plugin(body));
    const orders = await getOrders(ctx6, [L[0].id]);
    expect(orders).toStrictEqual([tillOrder]);
    for (const kept of orders[0]!.refunds) expect(kept).not.toHaveProperty('lines');
  });

  it('listOrders through the plugin route reads lines from its own hits at contract 6', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(plugin(refundLinesFixture)).mockResolvedValueOnce(listOf([L[0]]));
    const page = await listOrders(ctx6, { registerId: 'reg-1' });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(url(spy, 0).pathname).toBe('/tally/v1/orders');
    expect(url(spy, 1).pathname).toBe('/admin/orders');
    expect(page.orders[0]!.refunds[0]!.lines).toStrictEqual([fixtureLine]);
    expect(page.orders[0]!.refunds[1]).not.toHaveProperty('lines');
  });

  it('the admin listOrders path merges lines at contract 6', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(listOf([L[0]])).mockResolvedValueOnce(plugin(refundLinesFixture));
    const page = await listOrders(ctx6, {});
    expect(spy).toHaveBeenCalledTimes(2);
    expect(url(spy, 0).pathname).toBe('/admin/orders');
    expect(url(spy, 1).searchParams.get('ids')).toBe(L[0].id);
    expect(page.orders[0]!.refunds[0]!.lines).toStrictEqual([fixtureLine]);
    expect(page.orders[0]!.refunds[1]).not.toHaveProperty('lines');
  });
});

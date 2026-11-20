import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError, CustomerServiceError, UnsupportedOrderFilterError, type StoreOrder, type SyncContext } from '@tallyui/core';
import { createMedusaOrders, ORDER_FIELDS, toMedusaStoreOrder } from './orders';
import { medusaMinor, medusaSumMinor } from './money';
import { createMedusaAdminUserConnector } from './index';
import fixture from './orders.fixture.json';

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

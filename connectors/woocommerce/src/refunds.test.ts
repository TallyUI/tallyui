import { describe, expect, it } from 'vitest';
import { CustomerServiceError, StoreRefundsUnsupportedError, type ListRefundsQuery } from '@tallyui/core';
import { createWooRefunds } from './refunds';
// Recorded as the cashier from a local wp-env store: WooCommerce 10.4.3, woocommerce-pos 2.0.3, HPOS.
import list from './__tests__/fixtures/refunds-2.0.3/list.json';
import parents from './__tests__/fixtures/refunds-2.0.3/parents.json';

const baseUrl = 'https://woo.test/wp-json/wcpos/v2';

interface Store {
  site?: unknown;
  siteThrows?: boolean;
  refunds?: unknown;
  headers?: Record<string, string>;
  orders?: unknown;
}

/** A connector whose fetch answers /site, refunds? and orders?include= from `store`, recording every URL. */
function setup(store: Store = {}) {
  const urls: string[] = [];
  const fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    const route = url.slice(baseUrl.length + 1);
    const json = (body: unknown, headers?: Record<string, string>) => new Response(JSON.stringify(body), { status: 200, headers });
    if (route === 'site') {
      if (store.siteThrows) throw new TypeError('offline');
      return json('site' in store ? store.site : { wcpos_version: '2.0.3' });
    }
    if (route.startsWith('refunds?')) return json(store.refunds ?? [], store.headers);
    if (route.startsWith('orders?include=')) return json(store.orders ?? []);
    return new Response('{}', { status: 404 });
  }) as typeof globalThis.fetch;
  const context = { connectorId: 'woocommerce', baseUrl, headers: { Authorization: 'Bearer woo-token' }, fetch };
  const { listRefunds } = createWooRefunds();
  return { urls, store, list: (query?: ListRefundsQuery) => listRefunds(context, query) };
}

const recorded = [
  { id: '24', orderId: '21', refundedAt: '2026-11-24T18:32:45.000Z', currency: 'USD', amountMinor: 500 },
  { id: '23', orderId: '20', refundedAt: '2026-11-24T18:32:40.000Z', currency: 'EUR', amountMinor: 250 },
  { id: '22', orderId: '19', refundedAt: '2026-11-24T18:32:36.000Z', currency: 'USD', amountMinor: 440, reason: 'Damaged' },
];

describe('WooCommerce listRefunds', () => {
  it('R1 rejects below WCPOS 2.0.0 before any refunds request', async () => {
    for (const site of [{ wcpos_version: '1.10.20' }, { wcpos_version: '2.0.0-beta.1' }, { wcpos_version: '' }, {}, { wcpos_version: 'abc' }]) {
      const { urls, list } = setup({ site });
      await expect(list()).rejects.toBeInstanceOf(StoreRefundsUnsupportedError);
      expect(urls.filter((url) => url.includes('/refunds'))).toStrictEqual([]);
    }
    for (const wcpos_version of ['2.0.0', '2.0.3']) {
      await expect(setup({ site: { wcpos_version } }).list()).resolves.toMatchObject({ refunds: [], orphans: [], hasMore: false });
    }
  });

  it('R2 reads /site once per store, and again after a failed read', async () => {
    const ok = setup();
    await ok.list();
    await ok.list();
    expect(ok.urls.filter((url) => url.endsWith('/site'))).toHaveLength(1);

    const failing = setup({ siteThrows: true });
    const error = await failing.list().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CustomerServiceError);
    expect(error).not.toBeInstanceOf(StoreRefundsUnsupportedError);
    expect((error as CustomerServiceError).code).toBe('network');
    failing.store.siteThrows = false;
    await expect(failing.list()).resolves.toMatchObject({ refunds: [] });
    expect(failing.urls.filter((url) => url.endsWith('/site'))).toHaveLength(2);

    const upgraded = setup({ site: {} });
    await expect(upgraded.list()).rejects.toBeInstanceOf(StoreRefundsUnsupportedError);
    upgraded.store.site = { wcpos_version: '2.0.3' };
    await expect(upgraded.list()).resolves.toMatchObject({ refunds: [] });
    expect(upgraded.urls.filter((url) => url.endsWith('/site'))).toHaveLength(2);
    await upgraded.list();
    expect(upgraded.urls.filter((url) => url.endsWith('/site'))).toHaveLength(2);
  });

  it('R3 maps the recorded page in its parents\' currencies', async () => {
    const { urls, list: read } = setup({ refunds: list, orders: parents });
    const page = await read();
    expect(page.refunds).toStrictEqual(recorded);
    expect(page.orphans).toStrictEqual([]);
    expect(page).not.toHaveProperty('unreadable');
    expect(urls.filter((url) => url.includes('/orders?'))).toStrictEqual([`${baseUrl}/orders?include=21,20,19&per_page=3`]);
  });

  it('R4 returns a refund of a trashed order as an orphan', async () => {
    const page = await setup({ refunds: list, orders: parents.filter((order) => order.id !== 21) }).list();
    expect(page.orphans).toStrictEqual([{ id: '24', orderId: '21', refundedAt: '2026-11-24T18:32:45.000Z' }]);
    expect(page.refunds).toStrictEqual(recorded.slice(1));
  });

  it('R5 reads the amount in the parent order\'s currency', async () => {
    const row = { id: 9, parent_id: 7, amount: '500', date_created_gmt: '2026-11-05T13:30:00' };
    const jpy = await setup({ refunds: [row], orders: [{ id: 7, currency: 'JPY' }] }).list();
    expect(jpy.refunds).toStrictEqual([{ id: '9', orderId: '7', refundedAt: '2026-11-05T13:30:00.000Z', currency: 'JPY', amountMinor: 500 }]);
    const usd = await setup({ refunds: [row], orders: [{ id: 7, currency: 'USD' }] }).list();
    expect(usd.refunds).toMatchObject([{ currency: 'USD', amountMinor: 50000 }]);
  });

  it('R6 sends the query as listOrders does', async () => {
    const { urls, list: read } = setup();
    await read({});
    expect(urls.at(-1)).toMatch(/\/refunds\?page=1&per_page=25&orderby=date&order=desc&dp=6$/);
    await read({ page: 2, perPage: 500, dateRange: { after: '2026-11-05T00:00:00.000Z', before: '2026-11-06T00:00:00.000Z' }, orderId: '137' });
    expect(urls.at(-1)).toMatch(new RegExp(
      '/refunds\\?page=2&per_page=100&orderby=date&order=desc&dp=6&dates_are_gmt=true'
      + '&after=2026-11-04T23%3A59%3A59&before=2026-11-06T00%3A00%3A00&parent=137$',
    ));
  });

  it('R7 makes no request for an orderId that matches no order or a malformed dateRange', async () => {
    const { urls, list: read } = setup();
    for (const orderId of ['abc', '', '0', '007']) {
      await expect(read({ orderId })).resolves.toStrictEqual({ refunds: [], orphans: [], hasMore: false });
    }
    await expect(read({ dateRange: { after: '2026-11-05' } })).rejects.toBeInstanceOf(TypeError);
    expect(urls).toStrictEqual([]);
  });

  it('R8 pages by X-WP-TotalPages, or by a full page when it is missing', async () => {
    const counted = await setup({ refunds: list, orders: parents, headers: { 'X-WP-TotalPages': '3', 'X-WP-Total': '61' } }).list({ page: 1 });
    expect(counted).toMatchObject({ hasMore: true, total: 61 });
    const full = await setup({ refunds: list, orders: parents }).list({ perPage: 3 });
    expect(full.hasMore).toBe(true);
    expect(full).not.toHaveProperty('total');
    expect((await setup({ refunds: list, orders: parents }).list({ perPage: 4 })).hasMore).toBe(false);
  });

  it('R9 counts rows it cannot read and still maps the rest', async () => {
    const rows = [...list, { id: 30, parent_id: 19, amount: '1.00' }, { id: 31, parent_id: 19, amount: 'x', date_created_gmt: '2026-11-24T18:00:00' }];
    const page = await setup({ refunds: rows, orders: parents }).list();
    expect(page.unreadable).toBe(2);
    expect(page.refunds).toStrictEqual(recorded);
    expect(page.orphans).toStrictEqual([]);
  });

  it('R10 reads each page\'s distinct parents once, and none for an empty page', async () => {
    const twice = { ...list[2], id: 25, amount: '1.00' };
    const { urls, list: read } = setup({ refunds: [...list, twice], orders: parents });
    expect((await read()).refunds.map((refund) => refund.id)).toStrictEqual(['24', '23', '22', '25']);
    expect(urls.filter((url) => url.includes('/orders?'))).toStrictEqual([`${baseUrl}/orders?include=21,20,19&per_page=3`]);

    const empty = setup({ refunds: [] });
    await empty.list();
    expect(empty.urls.filter((url) => url.includes('/orders?'))).toStrictEqual([]);
  });

  it('R11 reads a dp=6 amount in the order\'s currency, whatever its sign', async () => {
    const row = { id: 9, parent_id: 7, amount: '4.400000', date_created_gmt: '2026-11-05T13:30:00' };
    for (const amount of ['4.400000', '-4.400000']) {
      const page = await setup({ refunds: [{ ...row, amount }], orders: [{ id: 7, currency: 'USD' }] }).list();
      expect(page.refunds).toMatchObject([{ id: '9', currency: 'USD', amountMinor: 440 }]);
    }
  });

  it('R12 returns a refund whose order has no currency as an orphan', async () => {
    const orders = parents.map((order) => (order.id === 20 ? { ...order, currency: '' } : order));
    const page = await setup({ refunds: list, orders }).list();
    expect(page.orphans).toStrictEqual([{ id: '23', orderId: '20', refundedAt: '2026-11-24T18:32:40.000Z' }]);
    expect(page.refunds).toStrictEqual([recorded[0], recorded[2]]);
  });
});

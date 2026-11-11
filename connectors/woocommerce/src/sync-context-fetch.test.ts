import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { SyncContext } from '@tallyui/core';
import { customerRequest } from './customers';
import { wooPaymentMethods } from './payment-methods';
import { wooReceiptTemplates } from './receipt-templates';
import { wooHasIdFastPath } from './reconcile/catalogue';
import { wooFetchCouponsByIds } from './reconcile/coupons';
import { wooFetchByIds } from './reconcile/feed';
import { wooProductReplication } from './replication/products';
import { readWooCapabilities, wooStoreSettings } from './store-settings';
import { wooProductSync } from './sync/products';
import stores from './__tests__/fixtures/taxes-1.10.20/stores.json';
import taxes from './__tests__/fixtures/taxes-1.10.20/taxes.json';
import classes from './__tests__/fixtures/taxes-1.10.20/tax-classes.json';
import methods from './__tests__/fixtures/payment-methods-2.0/payment-methods.json';

const BASE = 'https://woo.test/wp-json/wcpos/v2';
const MODIFIED = '2026-01-01T00:00:00';
const variable = {
  id: 10, type: 'variable', status: 'publish', variations: [11], date_modified_gmt: MODIFIED,
  meta_data: [{ key: '_woocommerce_pos_uuid', value: 'uuid-10' }],
};

/** One store that answers every route the in-scope functions ask, with a fresh Response per request. */
async function store(input: RequestInfo | URL): Promise<Response> {
  const url = new URL(String(input));
  const route = url.pathname.slice(new URL(BASE).pathname.length);
  const params = url.searchParams;
  switch (route) {
    case '/stores': return Response.json(stores);
    case '/status': return Response.json({ capabilities: ['order_create_v5'] });
    case '/site': return Response.json({ wcpos_version: '1.10.20' });
    case '/taxes/classes': return Response.json(classes);
    case '/taxes': return Response.json(params.get('page') === '1' ? taxes : []);
    case '/payment-methods': return Response.json(methods);
    case '/templates': return Response.json([]);
    case '/customers': return Response.json([]);
    case '/coupons': return Response.json([]);
    case '/variations': return Response.json({ documents: [{ parent_id: 10, payload: { id: 11, sku: 'v-11' } }] });
    case '/products':
      if (params.get('orderby') === 'modified') return Response.json([{ id: 10, date_modified_gmt: MODIFIED }]);
      if (params.get('orderby') === 'id' && params.has('offset')) return Response.json([variable], { headers: { 'X-WP-Total': '1' } });
      return Response.json([]);
    default: throw new Error(`Unexpected request: ${url}`);
  }
}

const baseContext = (): SyncContext => ({
  connectorId: 'woocommerce', baseUrl: BASE,
  headers: { Authorization: 'Bearer fetch-token', 'X-WCPOS': '1' }, signal: new AbortController().signal,
});

/** Each in-scope function, driven to cover its call sites, with the routes it must ask in order. */
const cases: Array<{ name: string; run: (context: SyncContext) => Promise<unknown>; routes: string[] }> = [
  { name: 'readWooCapabilities', run: readWooCapabilities, routes: ['/stores', '/status', '/site'] },
  { name: 'wooStoreSettings', run: wooStoreSettings, routes: ['/stores', '/taxes/classes', '/taxes'] },
  { name: 'wooPaymentMethods', run: wooPaymentMethods, routes: ['/payment-methods', '/stores'] },
  { name: 'wooReceiptTemplates', run: (context) => wooReceiptTemplates(context), routes: ['/templates'] },
  { name: 'customerRequest', run: (context) => customerRequest(context, 'customers?search=gee', { method: 'GET' }), routes: ['/customers'] },
  { name: 'wooHasIdFastPath (catalogue reconcile)', run: wooHasIdFastPath, routes: ['/status'] },
  { name: 'wooFetchCouponsByIds (coupons reconcile)', run: (context) => wooFetchCouponsByIds([{ key: '1', remote: 1 }], context), routes: ['/coupons'] },
  { name: 'wooFetchByIds (reconcile feed)', run: (context) => wooFetchByIds([{ key: '1', remote: 1 }], context), routes: ['/products'] },
  { name: 'wooProductReplication pull', run: (context) => wooProductReplication.pull.handler(undefined, 10, context), routes: ['/products', '/products', '/variations'] },
  { name: 'wooProductSync.fetchAllIds', run: (context) => wooProductSync.fetchAllIds(context), routes: ['/products'] },
  { name: 'wooProductSync.fetchByIds', run: (context) => wooProductSync.fetchByIds(['1'], context), routes: ['/products'] },
  { name: 'wooProductSync.fetchModifiedAfter', run: (context) => wooProductSync.fetchModifiedAfter!(MODIFIED, context), routes: ['/products'] },
];

const routes = (mock: { mock: { calls: unknown[][] } }) =>
  mock.mock.calls.map(([input]) => new URL(String(input)).pathname.slice(new URL(BASE).pathname.length));

let globalFetch: MockInstance<typeof fetch>;

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  globalFetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new Error('globalThis.fetch must not be called'); });
});

afterEach(() => { vi.restoreAllMocks(); });

describe('SyncContext.fetch in the WooCommerce connector', () => {
  it.each(cases)('$name sends every request through context.fetch, as it sent them through the global fetch', async ({ run, routes: expected }) => {
    const context = baseContext();
    const contextFetch = vi.fn<typeof fetch>(store);
    await run({ ...context, fetch: contextFetch });
    expect(globalFetch).not.toHaveBeenCalled();
    expect(routes(contextFetch)).toEqual(expected);

    // The same function without context.fetch: the global fetch gets exactly the same URLs and inits.
    globalFetch.mockImplementation(store);
    await run(context);
    expect(globalFetch.mock.calls).toEqual(contextFetch.mock.calls);
    expect(routes(globalFetch)).toEqual(expected);
  });

  it('the products pull returns the variation it fetched through context.fetch', async () => {
    const result = await wooProductReplication.pull.handler(undefined, 10, { ...baseContext(), fetch: vi.fn<typeof fetch>(store) });
    const documents = result.documents as Array<{ uuid: string; variation_docs: Array<{ id: number }> }>;
    expect(documents.map((doc) => [doc.uuid, doc.variation_docs.map((v) => v.id)])).toEqual([['uuid-10', [11]]]);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it.each(cases)('$name without context.fetch calls globalThis.fetch', async ({ run, routes: expected }) => {
    globalFetch.mockImplementation(store);
    await run(baseContext());
    expect(routes(globalFetch)).toEqual(expected);
  });

  it('honours a global fetch spy installed after import, per request', async () => {
    const first = vi.fn<typeof fetch>(store);
    vi.stubGlobal('fetch', first);
    await readWooCapabilities(baseContext());
    expect(routes(first)).toEqual(['/stores', '/status', '/site']);

    const second = vi.fn<typeof fetch>(store);
    vi.stubGlobal('fetch', second);
    await readWooCapabilities(baseContext());
    expect(routes(second)).toEqual(['/stores', '/status', '/site']);
    expect(first).toHaveBeenCalledTimes(3);
    vi.unstubAllGlobals();
  });
});

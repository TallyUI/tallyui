import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError, StoreSettingsError, type SyncContext } from '@tallyui/core';
import { wooStoreSettings, readWooCapabilities, WOO_ORDER_CREATE_VERSION } from './store-settings';
import { createWooCommerceConnector } from './index';
import stores from './__tests__/fixtures/taxes-1.10.20/stores.json';
import taxes from './__tests__/fixtures/taxes-1.10.20/taxes.json';
import classes from './__tests__/fixtures/taxes-1.10.20/tax-classes.json';
import pushedOrder from './__tests__/fixtures/taxes-1.10.20/push-orders-response.json';

const context: SyncContext = {
  connectorId: 'woocommerce', baseUrl: 'https://settings.test/wp-json/wcpos/v2',
  headers: { Authorization: 'Bearer settings-token', 'X-WCPOS': '1' }, signal: new AbortController().signal,
};
const fetchMock = vi.fn<typeof fetch>();
let storesBody: unknown;
let taxesBody: unknown;
let classesBody: unknown;
let secondPage: unknown;
let statusBody: unknown;

beforeEach(() => {
  storesBody = stores;
  taxesBody = taxes;
  classesBody = classes;
  secondPage = [];
  statusBody = { capabilities: ['order_create_v5'] };
  fetchMock.mockReset().mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/stores')) return Response.json(storesBody);
    if (url.pathname.endsWith('/status')) return Response.json(statusBody);
    if (url.pathname.endsWith('/taxes/classes')) return Response.json(classesBody);
    if (url.pathname.endsWith('/taxes')) return Response.json(url.searchParams.get('page') === '1' ? taxesBody : secondPage);
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('wooStoreSettings', () => {
  it('reads the captured settings and matched rates in WooCommerce order', async () => {
    const settings = await wooStoreSettings(context);
    expect(settings).toStrictEqual({
      currency: 'USD', pricesIncludeTax: false, taxRoundAtSubtotal: false, shippingTaxClass: 'inherit',
      taxClassSlugs: ['standard', 'reduced-rate', 'zero-rate'],
      taxRatesPpm: { default: 106250, 'reduced-rate': 55000, 'zero-rate': 0 },
      taxRates: expect.any(Object),
    });
    expect(settings.taxRates!.standard.map((rate) => rate.id)).toEqual([1, 2, 4]);
    expect(settings.taxRates!['reduced-rate'].map((rate) => rate.id)).toEqual([3]);
    expect(settings.taxRates!['zero-rate'].map((rate) => rate.id)).toEqual([5]);
    expect(settings.taxRates!.standard[2]).toStrictEqual({
      id: 4, code: 'US-CA-COMPOUND TEST-3', label: 'Compound Test', rate: '2.0000',
      priority: 3, compound: true, shipping: false,
    });
  });

  it('uses the rate codes captured from WooCommerce for every fixture rate', async () => {
    const settings = await wooStoreSettings(context);
    const matched = Object.values(settings.taxRates!).flat();
    expect(matched).toHaveLength(taxes.length);
    for (const rate of matched) {
      expect(rate.code).toBe(pushedOrder.document.tax_lines.find((line) => line.rate_id === rate.id)!.rate_code);
    }
  });

  it('uses the base address when the tax address is absent', async () => {
    const expected = await wooStoreSettings(context);
    const { tax_address: _address, ...store } = stores[0];
    storesBody = [store];
    expect((await wooStoreSettings(context)).taxRates).toStrictEqual(expected.taxRates);
    storesBody = [{ ...store, store_postcode: '90001' }];
    expect((await wooStoreSettings(context)).taxRates!.standard.map((rate) => rate.id)).toEqual([1, 4]);
  });

  it('falls back when the tax address has no country', async () => {
    storesBody = [{ ...stores[0], tax_address: { country: '', postcode: '90001' } }];
    expect((await wooStoreSettings(context)).taxRates!.standard.map((rate) => rate.id)).toEqual([1, 2, 4]);
  });

  it('warns once and matches an empty address when neither address has a country', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    storesBody = [{ ...stores[0], tax_address: {}, store_country: '' }];
    taxesBody = [...taxes, { ...taxes[0], id: 6, country: '', state: '', priority: 4 }];
    const settings = await wooStoreSettings(context);
    expect(settings.taxRates!.standard.map((rate) => rate.id)).toEqual([6]);
    expect(warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('empty address'));
  });

  it('reads classes but does not request rates when tax calculation is disabled', async () => {
    storesBody = [{ ...stores[0], calc_taxes: 'no' }];
    const settings = await wooStoreSettings(context);
    expect(settings.taxRates).toStrictEqual({});
    expect(settings.taxRatesPpm).toStrictEqual({ default: 0 });
    expect(settings.taxClassSlugs).toEqual(['standard', 'reduced-rate', 'zero-rate']);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `${context.baseUrl}/stores`, `${context.baseUrl}/taxes/classes`,
    ]);
  });

  it('reads all 101 rates across exactly two pages', async () => {
    taxesBody = Array.from({ length: 100 }, (_, index) => ({ ...taxes[0], id: index + 1, priority: index + 1 }));
    secondPage = [{ ...taxes[0], id: 101, priority: 101 }];
    const settings = await wooStoreSettings(context);
    expect(settings.taxRates!.standard.map((rate) => rate.id)).toEqual(Array.from({ length: 101 }, (_, index) => index + 1));
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/taxes?')).map(([url]) => url)).toEqual([
      `${context.baseUrl}/taxes?per_page=100&page=1&orderby=order&order=asc`,
      `${context.baseUrl}/taxes?per_page=100&page=2&orderby=order&order=asc`,
    ]);
  });

  it('stops at the page 100 guard', async () => {
    taxesBody = Array.from({ length: 100 }, (_, index) => ({ ...taxes[0], id: index + 1, priority: index + 1 }));
    secondPage = taxesBody;
    await wooStoreSettings(context);
    const calls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/taxes?'));
    expect(calls).toHaveLength(100);
    expect(calls[99][0]).toBe(`${context.baseUrl}/taxes?per_page=100&page=100&orderby=order&order=asc`);
  });

  it('normalizes the empty class and missing location arrays and preserves the wire rate string', async () => {
    const { postcodes: _postcodes, cities: _cities, ...rate } = taxes[0];
    taxesBody = [{ ...rate, class: '', name: '', country: '', state: '' }];
    const settings = await wooStoreSettings(context);
    expect(settings.taxRates!.standard).toStrictEqual([{
      id: 1, code: 'TAX-1', label: '', rate: '7.2500', priority: 1, compound: false, shipping: true,
    }]);
    expect(settings.taxRatesPpm).toStrictEqual({ default: 72500 });
  });

  it('uppercases currency, reads yes flags and omits a non-string shipping class', async () => {
    storesBody = [{ ...stores[0], currency: 'usd', prices_include_tax: 'yes', tax_round_at_subtotal: 'yes', shipping_tax_class: null }];
    const settings = await wooStoreSettings(context);
    expect(settings).toMatchObject({ currency: 'USD', pricesIncludeTax: true, taxRoundAtSubtotal: true });
    expect(settings).not.toHaveProperty('shippingTaxClass');
  });

  it('warns about a decimal count mismatch without changing the settings', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const expected = await wooStoreSettings(context);
    expect(warn).not.toHaveBeenCalled();
    storesBody = [{ ...stores[0], price_num_decimals: 3 }];
    expect(await wooStoreSettings(context)).toStrictEqual(expected);
    expect(warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('the till rounds USD to 2 digits'));
  });

  it('sends GET with the context base URL, headers and signal for every endpoint', async () => {
    await wooStoreSettings(context);
    expect(fetchMock.mock.calls).toEqual([
      [`${context.baseUrl}/stores`, { method: 'GET', headers: context.headers, signal: context.signal }],
      [`${context.baseUrl}/taxes/classes`, { method: 'GET', headers: context.headers, signal: context.signal }],
      [`${context.baseUrl}/taxes?per_page=100&page=1&orderby=order&order=asc`, { method: 'GET', headers: context.headers, signal: context.signal }],
    ]);
  });

  it.each([
    ['stores', 401], ['stores', 403], ['classes', 401], ['classes', 403], ['taxes', 401], ['taxes', 403],
  ] as const)('propagates HTTP %s %i as an auth error', async (endpoint, status) => {
    if (endpoint !== 'stores') fetchMock.mockResolvedValueOnce(Response.json(stores));
    if (endpoint === 'taxes') fetchMock.mockResolvedValueOnce(Response.json(classes));
    fetchMock.mockResolvedValueOnce(new Response(null, { status }));
    const result = wooStoreSettings(context);
    await expect(result).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
    await expect(result).rejects.toMatchObject({ status });
  });

  it.each(['stores', 'classes', 'taxes'])('wraps HTTP 500 from %s as failed', async (endpoint) => {
    if (endpoint !== 'stores') fetchMock.mockResolvedValueOnce(Response.json(stores));
    if (endpoint === 'taxes') fetchMock.mockResolvedValueOnce(Response.json(classes));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    const result = wooStoreSettings(context);
    await expect(result).rejects.toBeInstanceOf(StoreSettingsError);
    await expect(result).rejects.toMatchObject({ code: 'failed', message: expect.stringContaining('500') });
  });

  it.each(['stores', 'classes', 'taxes'])('rejects the wrong body shape for %s', async (endpoint) => {
    if (endpoint === 'stores') storesBody = [];
    if (endpoint === 'classes') classesBody = {};
    if (endpoint === 'taxes') taxesBody = {};
    await expect(wooStoreSettings(context)).rejects.toMatchObject({ code: 'failed', message: expect.stringContaining('array') });
  });

  it('wraps a network failure with its reason', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network unavailable'));
    await expect(wooStoreSettings(context)).rejects.toMatchObject({ code: 'failed', message: 'Network unavailable' });
  });
});

describe('readWooCapabilities', () => {
  it('reads the captured rounding flag and the supported order version with context requests', async () => {
    expect(WOO_ORDER_CREATE_VERSION).toBe(5);
    expect(await readWooCapabilities(context)).toStrictEqual({
      orderCreate: 5, taxRounding: { granularity: 'woocommerce', roundAtSubtotal: false },
      multiplePayments: false,
      lineTax: { none: true, classes: true },
    });
    expect(fetchMock.mock.calls).toEqual([
      [`${context.baseUrl}/stores`, { method: 'GET', headers: context.headers, signal: context.signal }],
      [`${context.baseUrl}/status`, { method: 'GET', headers: context.headers, signal: context.signal }],
    ]);
  });

  it.each([
    [{ capabilities: [] }, false],
    [{ capabilities: ['order_payments_list'] }, true],
    [{ capabilities: ['products_id_fast_path'] }, false],
  ])('uses order version 3 without the v5 flag in %j', async (body, multiplePayments) => {
    statusBody = body;
    expect(await readWooCapabilities(context)).toStrictEqual({
      orderCreate: 3, taxRounding: { granularity: 'woocommerce', roundAtSubtotal: false }, multiplePayments,
      lineTax: { none: true, classes: true },
    });
  });

  it.each([
    {},
    { capabilities: 'order_create_v5' },
    { capabilities: { order_create_v5: true } },
    { order_create_v5: true },
  ])('uses order version 3 when the v5 capability list is missing in %j', async (body) => {
    statusBody = body;
    expect(await readWooCapabilities(context)).toStrictEqual({
      orderCreate: 3, taxRounding: { granularity: 'woocommerce', roundAtSubtotal: false }, multiplePayments: false,
      lineTax: { none: true, classes: true },
    });
  });

  it('accepts an explicit v5 advertisement without a site version', async () => {
    statusBody = { capabilities: ['order_create_v5'] };
    expect(await readWooCapabilities(context)).toStrictEqual({
      orderCreate: 5, taxRounding: { granularity: 'woocommerce', roundAtSubtotal: false }, multiplePayments: false,
      lineTax: { none: true, classes: true },
    });
  });

  it('accepts an explicit v5 advertisement with payment lists', async () => {
    statusBody = { capabilities: ['order_create_v5', 'order_payments_list'] };
    expect(await readWooCapabilities(context)).toStrictEqual({
      orderCreate: 5, taxRounding: { granularity: 'woocommerce', roundAtSubtotal: false }, multiplePayments: true,
      lineTax: { none: true, classes: true },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(['1.10.19', '1.11.0'])('uses order version 3 without the flag regardless of site version %s', async (wcpos_version) => {
    statusBody = {};
    const defaultFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      if (new URL(String(input)).pathname.endsWith('/site')) return Response.json({ wcpos_version });
      return defaultFetch(input, init);
    });
    expect(await readWooCapabilities(context)).toStrictEqual({
      orderCreate: 3, taxRounding: { granularity: 'woocommerce', roundAtSubtotal: false }, multiplePayments: false,
      lineTax: { none: true, classes: true },
    });
    expect(fetchMock.mock.calls.map(([input]) => String(input)).some((url) => url.endsWith('/site'))).toBe(false);
  });

  it('reads subtotal rounding enabled', async () => {
    storesBody = [{ ...stores[0], tax_round_at_subtotal: 'yes' }];
    expect(await readWooCapabilities(context)).toStrictEqual({
      orderCreate: 5, taxRounding: { granularity: 'woocommerce', roundAtSubtotal: true },
      multiplePayments: false,
      lineTax: { none: true, classes: true },
    });
  });

  it.each([
    [{ capabilities: ['order_payments_list'] }, true],
    [{}, false],
    [{ capabilities: ['products_id_fast_path'] }, false],
    [{ capabilities: 'order_payments_list' }, false],
  ])('reads the payment list advertisement from %j', async (body, multiplePayments) => {
    fetchMock.mockResolvedValueOnce(Response.json(stores)).mockResolvedValueOnce(Response.json(body));
    expect(await readWooCapabilities(context)).toStrictEqual({
      orderCreate: 3, taxRounding: { granularity: 'woocommerce', roundAtSubtotal: false }, multiplePayments,
      lineTax: { none: true, classes: true },
    });
  });

  it.each(['HTTP 500', 'network', 'bad JSON'])('keeps capabilities without payment lists on status %s', async (failure) => {
    fetchMock.mockResolvedValueOnce(Response.json(stores));
    if (failure === 'network') fetchMock.mockRejectedValueOnce(new TypeError('Network unavailable'));
    else fetchMock.mockResolvedValueOnce(failure === 'HTTP 500'
      ? new Response(null, { status: 500 }) : new Response('invalid JSON'));
    expect(await readWooCapabilities(context)).toStrictEqual({
      orderCreate: 3, taxRounding: { granularity: 'woocommerce', roundAtSubtotal: false }, multiplePayments: false,
      lineTax: { none: true, classes: true },
    });
  });

  it.each([401, 403])('propagates status HTTP %i as an auth error', async (status) => {
    fetchMock.mockResolvedValueOnce(Response.json(stores)).mockResolvedValueOnce(new Response(null, { status }));
    const result = readWooCapabilities(context);
    await expect(result).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
    await expect(result).rejects.toMatchObject({ status });
  });

  it.each([401, 403])('propagates HTTP %i as an auth error', async (status) => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status }));
    const result = readWooCapabilities(context);
    await expect(result).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
    await expect(result).rejects.toMatchObject({ status });
  });

  it('returns undefined for HTTP 500', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    expect(await readWooCapabilities(context)).toBeUndefined();
  });

  it('returns undefined for a network failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network unavailable'));
    expect(await readWooCapabilities(context)).toBeUndefined();
  });

  it.each([[], {}, null, [null], ['store'], [[]]].map((body) => [body]))('returns undefined for a malformed body (%j)', async (body) => {
    storesBody = body;
    expect(await readWooCapabilities(context)).toBeUndefined();
  });

  it('returns undefined for invalid JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('invalid JSON'));
    expect(await readWooCapabilities(context)).toBeUndefined();
  });

  it('wires both readers into the connector', () => {
    const connector = createWooCommerceConnector();
    expect(connector.storeSettings).toBe(wooStoreSettings);
    expect(connector.capabilities).toBe(readWooCapabilities);
  });
});

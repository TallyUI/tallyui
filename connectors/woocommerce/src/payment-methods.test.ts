import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError, defaultPaymentMethods, type SyncContext } from '@tallyui/core';
import { wooPaymentMethods } from './payment-methods';
import { createWooCommerceConnector } from './index';
// Hand-built from woocommerce-pos includes/Payments/Contract/Descriptor_Builder.php (contract 1.3), not a recorded response.
import fixture from './__tests__/fixtures/payment-methods-2.0/payment-methods.json';

const context: SyncContext = {
  connectorId: 'woocommerce', baseUrl: 'https://woo.test/wp-json/wcpos/v2',
  headers: { Authorization: 'Bearer methods-token', 'X-WCPOS': '1' }, signal: new AbortController().signal,
};
const fetchMock = vi.fn<typeof fetch>();
let methodsResponse: () => Response;
let storesBody: unknown;
let warn: ReturnType<typeof vi.spyOn>;

const requests = () => fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname);
const envelope = (methods: unknown[]) => ({ schema: 1, contract: '1.3', methods });
const row = (overrides: Record<string, unknown> = {}) => ({
  schema: 1, id: 'm', title: 'M', kind: 'cash', pos_enabled: true, order: 0,
  capture: { mode: 'manual', provider: null, hardware: null },
  capabilities: { amount: { partial: true }, change: true, refunds: { via: 'manual', partial: true }, tips: 'none', offline: 'record', void: true },
  defaults: { order_status: 'completed', rounding: null, open_drawer: true },
  ...overrides,
});
const respondWith = (body: unknown) => { methodsResponse = () => Response.json(body); };

beforeEach(() => {
  respondWith(fixture);
  storesBody = [{ id: 0, currency: 'USD' }];
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  fetchMock.mockReset().mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    expect(init).toMatchObject({ method: 'GET', headers: context.headers, signal: context.signal });
    if (url.pathname === '/wp-json/wcpos/v2/payment-methods') return methodsResponse();
    if (url.pathname === '/wp-json/wcpos/v2/stores') return Response.json(storesBody);
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('wooPaymentMethods', () => {
  it('maps the 2.0 fixture: enabled gateways in order, money in minor units, wire-only keys dropped', async () => {
    const methods = await wooPaymentMethods(context);
    expect(methods.map((method) => method.id)).toEqual(['pos_cash', 'pos_card', 'stripe_terminal', 'bacs']);
    expect(methods[0]).toEqual({
      id: 'pos_cash', title: 'Cash', kind: 'cash',
      capture: { mode: 'manual', provider: null, hardware: null, modes: [] },
      capabilities: {
        amount: { partial: true }, change: true, refunds: { via: 'manual', partial: true }, tips: 'none', offline: 'record', void: true,
      },
      defaults: { rounding: { incrementMinor: 5, mode: 'nearest' }, openDrawer: true },
    });
    const hardware = {
      discovery: 'server',
      readers: [{ id: 'tmr_1', label: 'Front counter', status: 'online', default: true }],
      defaultReader: 'tmr_1',
      lockToDefault: false,
    };
    expect(methods[2]).toEqual({
      id: 'stripe_terminal', title: 'Stripe Terminal', kind: 'card',
      capture: { mode: 'device', provider: 'stripe', hardware, modes: [{ mode: 'device', provider: 'stripe', hardware }] },
      capabilities: {
        amount: { partial: false, minMinor: 50, maxMinor: 1000000 },
        change: false, refunds: { via: 'provider', partial: true }, tips: 'on_reader', offline: 'none', void: false,
      },
      defaults: { rounding: null, openDrawer: false },
    });
    for (const method of methods) {
      for (const key of ['pos_enabled', 'order', 'provider_data', 'webview_available', 'fields', 'schema']) {
        expect(method).not.toHaveProperty(key);
        expect(method.capture).not.toHaveProperty(key);
      }
      expect(method.defaults).not.toHaveProperty('order_status');
    }
    expect(requests()).toEqual(['/wp-json/wcpos/v2/payment-methods', '/wp-json/wcpos/v2/stores']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('converts with the store currency: JPY has no minor digits', async () => {
    const cash = row({
      capabilities: { amount: { partial: true, min: '500', max: '20000' }, change: true, refunds: { via: 'manual', partial: true }, tips: 'none', offline: 'record', void: true },
      defaults: { rounding: { increment: '5', mode: 'nearest' }, open_drawer: true },
    });
    respondWith(envelope([cash]));
    storesBody = [{ currency: 'jpy' }];
    const [jpy] = await wooPaymentMethods(context);
    expect(jpy.defaults.rounding).toEqual({ incrementMinor: 5, mode: 'nearest' });
    expect(jpy.capabilities.amount).toEqual({ partial: true, minMinor: 500, maxMinor: 20000 });

    storesBody = [{ currency: 'usd' }];
    const [usd] = await wooPaymentMethods(context);
    expect(usd.defaults.rounding).toEqual({ incrementMinor: 500, mode: 'nearest' });
    expect(usd.capabilities.amount).toEqual({ partial: true, minMinor: 50000, maxMinor: 2000000 });
  });

  it('sorts by order, a missing order as 999, and keeps wire order on ties', async () => {
    const { order: _, ...unordered } = row({ id: 'none' });
    respondWith(envelope([row({ id: 'five', order: 5 }), unordered, row({ id: 'one', order: 1 }), row({ id: 'five-b', order: 5 })]));
    expect((await wooPaymentMethods(context)).map((method) => method.id)).toEqual(['one', 'five', 'five-b', 'none']);
  });

  it('makes no /stores request when no enabled row has a money string', async () => {
    respondWith(envelope([row()]));
    expect(await wooPaymentMethods(context)).toHaveLength(1);
    expect(requests()).toEqual(['/wp-json/wcpos/v2/payment-methods']);
  });

  it('falls back to the default methods on a plugin older than 2.0.0 (404)', async () => {
    methodsResponse = () => new Response('', { status: 404 });
    expect(await wooPaymentMethods(context)).toEqual(defaultPaymentMethods());
  });

  it.each([401, 403])('rejects a %i with ConnectorUnauthorizedError', async (status) => {
    methodsResponse = () => new Response('', { status });
    await expect(wooPaymentMethods(context)).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
  });

  it('rejects a 401 on /stores with ConnectorUnauthorizedError and an unreadable /stores as no store currency', async () => {
    fetchMock.mockImplementationOnce(async () => Response.json(fixture)).mockImplementationOnce(async () => new Response('', { status: 401 }));
    await expect(wooPaymentMethods(context)).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
    storesBody = [{ currency: 7 }];
    await expect(wooPaymentMethods(context)).rejects.toThrow('WooCommerce payment methods: no store currency');
  });

  it('rejects other failures and envelopes it cannot read', async () => {
    methodsResponse = () => new Response('', { status: 500 });
    await expect(wooPaymentMethods(context)).rejects.toThrow('HTTP 500');
    respondWith({ schema: 2, contract: '2.0', methods: [] });
    await expect(wooPaymentMethods(context)).rejects.toThrow('unsupported schema 2');
    respondWith([]);
    await expect(wooPaymentMethods(context)).rejects.toThrow('unexpected response');
  });

  it('drops malformed rows, one warn each, and keeps the good rows next to them', async () => {
    const { id: _, ...noId } = row();
    const badMin = row({ id: 'bad-min', capabilities: { ...row().capabilities as object, amount: { partial: true, min: 'abc' } } });
    respondWith(envelope([row({ id: 'good-a' }), noId, row({ id: 'no-capture', capture: null }), row({ id: 'v2', schema: 2 }), badMin, row({ id: 'good-b' })]));
    expect((await wooPaymentMethods(context)).map((method) => method.id)).toEqual(['good-a', 'good-b']);
    expect(warn).toHaveBeenCalledTimes(4);
  });

  it('falls back to the default methods when every listed row is broken', async () => {
    respondWith(envelope([row({ schema: 2 }), row({ capture: null }), 'junk']));
    expect(await wooPaymentMethods(context)).toEqual(defaultPaymentMethods());
    expect(warn).toHaveBeenCalledTimes(4);
  });

  it('returns [] when the store offers nothing', async () => {
    respondWith(envelope([row({ pos_enabled: false }), row({ id: 'n', pos_enabled: false })]));
    expect(await wooPaymentMethods(context)).toEqual([]);
    respondWith(envelope([]));
    expect(await wooPaymentMethods(context)).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps a row whose rounding it cannot read, unrounded, with one warn', async () => {
    respondWith(envelope([
      row({ id: 'ceil', defaults: { rounding: { increment: '0.05', mode: 'ceil' }, open_drawer: true } }),
      row({ id: 'zero', defaults: { rounding: { increment: '0', mode: 'nearest' }, open_drawer: true } }),
    ]));
    const methods = await wooPaymentMethods(context);
    expect(methods.map((method) => [method.id, method.defaults.rounding])).toEqual([['ceil', null], ['zero', null]]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('keeps unknown kinds and capture modes as they are', async () => {
    respondWith(envelope([row({ kind: 'crypto', capture: { mode: 'future', provider: 'acme', hardware: { discovery: 'sdk', transports: [{ transport: 'nfc', offline: 'queue', tips: 'at_till' }] } } })]));
    const [method] = await wooPaymentMethods(context);
    expect(method.kind).toBe('crypto');
    expect(method.capture).toEqual({
      mode: 'future', provider: 'acme', hardware: { discovery: 'sdk', transports: [{ transport: 'nfc', offline: 'queue', tips: 'at_till' }] },
    });
  });

  it('is wired into the connector', () => {
    expect(createWooCommerceConnector().paymentMethods).toBe(wooPaymentMethods);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError, type SyncContext } from '@tallyui/core';
import { createVendureConnector, vendureAuth, vendureConnector } from './index';
import { readVendureCapabilities } from './capabilities';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const rounding = { granularity: 'per_rate_group_items', mode: 'half_up' };
afterEach(() => vi.restoreAllMocks());

/** Routes the global fetch: `/tally/v1/info` gets `info()`, the session probe gets `probe()`. */
function stubFetch(info: () => Response, probe: () => Response = () => json({ data: { activeAdministrator: null } })) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) =>
    String(url).endsWith('/tally/v1/info') ? info() : String(init?.body).includes('activeAdministrator') ? probe() : json({}, 500));
}

const read = () => readVendureCapabilities('https://vendure.test', { Authorization: 'Bearer tok' });

describe('readVendureCapabilities', () => {
  it('T13 reads a versioned chargeTaxMode and warns once for each malformed advertisement', async () => {
    let body: { chargeTaxMode?: unknown } = {};
    stubFetch(() => json(body));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(read()).resolves.toStrictEqual({ orderCreate: 1 });
    for (const v of [1, 2]) {
      body = { chargeTaxMode: { v } };
      await expect(read()).resolves.toStrictEqual({ orderCreate: 1, chargeTaxMode: true });
    }
    expect(warn).not.toHaveBeenCalled();
    for (const chargeTaxMode of [{ v: 0 }, { v: '1' }, true, [], null]) {
      body = { chargeTaxMode };
      await expect(read()).resolves.toStrictEqual({ orderCreate: 1 });
      expect(warn).toHaveBeenCalledExactlyOnceWith('@tallyui/connector-vendure: ignoring a malformed chargeTaxMode');
      warn.mockClear();
    }
  });

  it('T14 reads a versioned cashRounding and warns once for each malformed advertisement', async () => {
    let body: { cashRounding?: unknown } = {};
    stubFetch(() => json(body));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(read()).resolves.toStrictEqual({ orderCreate: 1 });
    for (const version of [1, 2]) {
      body = { cashRounding: { v: version } };
      await expect(read()).resolves.toStrictEqual({ orderCreate: 1, cashRounding: true });
    }
    expect(warn).not.toHaveBeenCalled();
    for (const cashRounding of [{ v: 0 }, { v: '1' }, { v: 1.5 }, true, [], null]) {
      body = { cashRounding };
      await expect(read()).resolves.toStrictEqual({ orderCreate: 1 });
      expect(warn).toHaveBeenCalledExactlyOnceWith('@tallyui/connector-vendure: ignoring a malformed cashRounding');
      warn.mockClear();
    }
  });

  it('V1 omits both exempt capabilities when neither is declared', async () => {
    stubFetch(() => json({}));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(read()).resolves.toStrictEqual({ orderCreate: 1 });
    expect(warn).not.toHaveBeenCalled();
  });

  it('V2 reads taxExempt without implying taxExemptCoupons', async () => {
    stubFetch(() => json({ taxExempt: true }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(read()).resolves.toStrictEqual({ orderCreate: 1, taxExempt: true });
    expect(warn).not.toHaveBeenCalled();
  });

  it('V3 reads both exempt capabilities when both are true', async () => {
    stubFetch(() => json({ taxExempt: true, taxExemptCoupons: true }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(read()).resolves.toStrictEqual({ orderCreate: 1, taxExempt: true, taxExemptCoupons: true });
    expect(warn).not.toHaveBeenCalled();
  });

  it('V4 warns and ignores taxExemptCoupons without taxExempt', async () => {
    stubFetch(() => json({ taxExemptCoupons: true }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(read()).resolves.toStrictEqual({ orderCreate: 1 });
    expect(warn).toHaveBeenCalledExactlyOnceWith('@tallyui/connector-vendure: ignoring taxExemptCoupons without taxExempt');
  });

  it('V5 keeps taxExempt but warns for malformed taxExemptCoupons', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const taxExemptCoupons of [false, 1, 'true', { v: 1 }, null]) {
      stubFetch(() => json({ taxExempt: true, taxExemptCoupons }));
      await expect(read()).resolves.toStrictEqual({ orderCreate: 1, taxExempt: true });
      expect(warn).toHaveBeenCalledExactlyOnceWith('@tallyui/connector-vendure: ignoring a malformed taxExemptCoupons');
      warn.mockClear();
    }
  });

  it('V6 warns and ignores malformed taxExempt', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const taxExempt of [false, 1, 'true', { v: 1 }, null, []]) {
      stubFetch(() => json({ taxExempt }));
      await expect(read()).resolves.toStrictEqual({ orderCreate: 1 });
      expect(warn).toHaveBeenCalledExactlyOnceWith('@tallyui/connector-vendure: ignoring a malformed taxExempt');
      warn.mockClear();
    }
  });

  it('V7 warns for malformed taxExempt and for the unsupported coupon declaration', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const taxExempt of [false, 1, 'true', { v: 1 }, null, []]) {
      stubFetch(() => json({ taxExempt, taxExemptCoupons: true }));
      await expect(read()).resolves.toStrictEqual({ orderCreate: 1 });
      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenNthCalledWith(1, '@tallyui/connector-vendure: ignoring a malformed taxExempt');
      expect(warn).toHaveBeenNthCalledWith(2, '@tallyui/connector-vendure: ignoring taxExemptCoupons without taxExempt');
      warn.mockClear();
    }
  });

  it('V8 preserves chargeTaxMode and coupons alongside both exempt capabilities', async () => {
    stubFetch(() => json({ taxExempt: true, taxExemptCoupons: true, chargeTaxMode: { v: 1 }, coupons: true }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(read()).resolves.toStrictEqual({ orderCreate: 1, taxExempt: true, taxExemptCoupons: true, chargeTaxMode: true, coupons: true });
    expect(warn).not.toHaveBeenCalled();
  });

  it('V9 keeps both exemption capabilities when no reason is advertised', async () => {
    stubFetch(() => json({ contracts: { 'order.create': [1, 12] }, taxExempt: true, taxExemptCoupons: true }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(read()).resolves.toStrictEqual({ orderCreate: 12, taxExempt: true, taxExemptCoupons: true });
    expect(warn).not.toHaveBeenCalled();
  });

  it('V10 reads an optional reason at order.create 13', async () => {
    stubFetch(() => json({ contracts: { 'order.create': [1, 13] }, taxExempt: true, taxExemptReason: 'optional' }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(read()).resolves.toStrictEqual({ orderCreate: 13, taxExempt: true, taxExemptReason: 'optional' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('V11 keeps an optional reason at order.create 12', async () => {
    stubFetch(() => json({ contracts: { 'order.create': [1, 12] }, taxExempt: true, taxExemptReason: 'optional' }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(read()).resolves.toStrictEqual({ orderCreate: 12, taxExempt: true, taxExemptReason: 'optional' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('V12 reads a required reason at order.create 13', async () => {
    stubFetch(() => json({ contracts: { 'order.create': [1, 13] }, taxExempt: true, taxExemptReason: 'required' }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(read()).resolves.toStrictEqual({ orderCreate: 13, taxExempt: true, taxExemptReason: 'required' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('V13 omits all exemption capabilities when order.create cannot carry a required reason', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const contracts of [{ 'order.create': [1, 12] }, undefined]) {
      stubFetch(() => json({ contracts, taxExempt: true, taxExemptCoupons: true, taxExemptReason: 'required' }));
      await expect(read()).resolves.toStrictEqual({ orderCreate: contracts ? 12 : 1 });
      expect(warn).toHaveBeenCalledExactlyOnceWith('@tallyui/connector-vendure: ignoring taxExempt: taxExemptReason is required but order.create is below 13');
      warn.mockClear();
    }
  });

  it('V14 warns and ignores a reason without taxExempt', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const taxExemptReason of ['optional', 'required']) {
      for (const taxExempt of [undefined, false, 1, 'true', { v: 1 }, null, []]) {
        stubFetch(() => json({ taxExempt, taxExemptReason }));
        await expect(read()).resolves.toStrictEqual({ orderCreate: 1 });
        if (taxExempt === undefined) {
          expect(warn).toHaveBeenCalledExactlyOnceWith('@tallyui/connector-vendure: ignoring taxExemptReason without taxExempt');
        } else {
          expect(warn).toHaveBeenCalledTimes(2);
          expect(warn).toHaveBeenNthCalledWith(1, '@tallyui/connector-vendure: ignoring a malformed taxExempt');
          expect(warn).toHaveBeenNthCalledWith(2, '@tallyui/connector-vendure: ignoring taxExemptReason without taxExempt');
        }
        warn.mockClear();
      }
    }
  });

  it('V15 keeps taxExempt but warns for malformed taxExemptReason', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const taxExemptReason of ['Required', true, 1, null, {}, '']) {
      stubFetch(() => json({ contracts: { 'order.create': [1, 13] }, taxExempt: true, taxExemptReason }));
      await expect(read()).resolves.toStrictEqual({ orderCreate: 13, taxExempt: true });
      expect(warn).toHaveBeenCalledExactlyOnceWith('@tallyui/connector-vendure: ignoring a malformed taxExemptReason');
      warn.mockClear();
    }
  });

  it('V16 skips the malformed taxExemptCoupons warning when order.create cannot carry a required reason', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const taxExemptCoupons of ['yes', 1, null, {}]) {
      stubFetch(() => json({ contracts: { 'order.create': [1, 12] }, taxExempt: true, taxExemptCoupons, taxExemptReason: 'required' }));
      await expect(read()).resolves.toStrictEqual({ orderCreate: 12 });
      expect(warn).toHaveBeenCalledExactlyOnceWith('@tallyui/connector-vendure: ignoring taxExempt: taxExemptReason is required but order.create is below 13');
      warn.mockClear();
    }
  });

  // The plugin's exact bodies (vendurepos/app#60): it always sends taxRounding.
  it.each([
    '{"contracts":{"order.create":[1,2,3]},"taxRounding":{"granularity":"per_line_items","mode":"half_up"}}',
    '{"contracts":{"order.create":[1,2,3]},"taxRounding":{"granularity":"per_rate_group_items","mode":"half_up"}}',
    '{"contracts":{"order.create":[1,2,3]},"taxRounding":{"granularity":"custom"}}',
  ])('reads contracts and the top-level taxRounding from a 2xx: %s', async (body) => {
    const spy = stubFetch(() => new Response(body, { status: 200 }));
    await expect(read()).resolves.toStrictEqual({ orderCreate: 3, taxRounding: JSON.parse(body).taxRounding });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('https://vendure.test/tally/v1/info');
    expect(init).toMatchObject({ method: 'GET', headers: { Authorization: 'Bearer tok' } });
  });

  it('reads a 2xx without taxRounding (an older plugin)', async () => {
    stubFetch(() => json({ contracts: { 'order.create': [1, 2, 3] } }));
    await expect(read()).resolves.toStrictEqual({ orderCreate: 3 });
  });

  it('gives { orderCreate: 1 } on a 404 (an old plugin)', async () => {
    stubFetch(() => json({}, 404));
    await expect(read()).resolves.toStrictEqual({ orderCreate: 1 });
  });

  it('gives undefined on a 2xx non-JSON body', async () => {
    stubFetch(() => new Response('<html>', { status: 200 }));
    await expect(read()).resolves.toBeUndefined();
  });

  it('gives undefined on a 2xx null JSON body', async () => {
    stubFetch(() => json(null));
    await expect(read()).resolves.toBeUndefined();
  });

  it('gives undefined on a malformed taxRounding', async () => {
    stubFetch(() => json({ contracts: { 'order.create': [1, 2] }, taxRounding: { granularity: 'bogus' } }));
    await expect(read()).resolves.toBeUndefined();
  });

  it('gives { orderCreate: 1 } on a 2xx with missing contracts', async () => {
    stubFetch(() => json({ ok: true }));
    await expect(read()).resolves.toStrictEqual({ orderCreate: 1 });
  });

  it('gives undefined on a 5xx (unknown)', async () => {
    for (const status of [500, 502, 429]) {
      stubFetch(() => json({}, status));
      await expect(read()).resolves.toBeUndefined();
    }
  });

  it('gives undefined on a network failure (unknown)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    await expect(read()).resolves.toBeUndefined();
  });

  it('throws ConnectorUnauthorizedError on a 403 when the session is signed out (#279)', async () => {
    const spy = stubFetch(() => json({}, 403));
    const result = read();
    await expect(result).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
    await expect(result).rejects.toMatchObject({ status: 401 });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1]![1]!.headers).toMatchObject({ Authorization: 'Bearer tok' });
  });

  it('throws forbidden naming CreateOrder on a 403 when the session is signed in (#279)', async () => {
    stubFetch(() => json({}, 403), () => json({ data: { activeAdministrator: { id: '1' } } }));
    const result = read();
    await expect(result).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
    await expect(result).rejects.toMatchObject({ status: 403, code: 'forbidden' });
    await expect(result).rejects.toThrow('the CreateOrder permission is missing');
  });

  it('gives undefined on a 403 when the session check itself fails', async () => {
    stubFetch(() => json({}, 403), () => json({}, 500));
    await expect(read()).resolves.toBeUndefined();
  });
});

describe('Vendure capabilities wiring', () => {
  const login = () => json({ data: { login: { __typename: 'CurrentUser', id: '1' } } }, 200, { 'vendure-auth-token': 'tok_new' });

  it('sign-in returns the capabilities, read with the new token', async () => {
    const fetch = vi.fn(async (url: string | URL | Request, _init?: RequestInit) =>
      String(url).endsWith('/tally/v1/info') ? json({ contracts: { 'order.create': [1, 2, 3] }, taxRounding: rounding }) : login());
    await expect(vendureAuth.signIn!('https://vendure.test', { email: 'a', password: 'b' }, { fetch }))
      .resolves.toStrictEqual({ token: 'tok_new', expiresAt: undefined, capabilities: { orderCreate: 3, taxRounding: rounding } });
    expect(fetch.mock.calls[1]![1]!.headers).toStrictEqual({ Authorization: 'Bearer tok_new' });
  });

  it('a capabilities read that throws leaves the sign-in successful, with unknown capabilities', async () => {
    stubFetch(() => json({}, 403), () => json({ data: { activeAdministrator: { id: '1' } } }));
    const fetch = vi.fn(async (url: string | URL | Request, _init?: RequestInit) =>
      String(url).endsWith('/tally/v1/info') ? json({}, 403) : login());
    await expect(vendureAuth.signIn!('https://vendure.test', { email: 'a', password: 'b' }, { fetch }))
      .resolves.toStrictEqual({ token: 'tok_new', expiresAt: undefined, capabilities: undefined });
  });

  it('capabilities(context) sends the API-key and channel headers', async () => {
    const spy = stubFetch(() => json({ contracts: { 'order.create': [1, 2, 3] }, taxRounding: rounding }));
    const headers = vendureAuth.getHeaders({ api_key: 'key_1', token: 'tok', channel_token: 'ch_1' });
    const context: SyncContext = { connectorId: 'vendure', baseUrl: 'https://vendure.test', headers };
    await expect(createVendureConnector().capabilities!(context)).resolves.toStrictEqual({ orderCreate: 3, taxRounding: rounding });
    expect(spy.mock.calls[0]![1]!.headers).toStrictEqual({ 'vendure-api-key': 'key_1', 'vendure-token': 'ch_1' });
  });

  it('declares discounted lines as taxed rows (ADR-048)', () => {
    expect(createVendureConnector().discountsAreTaxedRows).toBe(true);
    expect(createVendureConnector({ tallyFields: false }).discountsAreTaxedRows).toBe(true);
    expect(vendureConnector.discountsAreTaxedRows).toBe(true);
  });
});

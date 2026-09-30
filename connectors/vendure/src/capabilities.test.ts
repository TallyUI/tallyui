import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError, type SyncContext } from '@tallyui/core';
import { createVendureConnector, vendureAuth } from './index';
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

  it('throws a plain Error naming CreateOrder on a 403 when the session is signed in (#279)', async () => {
    stubFetch(() => json({}, 403), () => json({ data: { activeAdministrator: { id: '1' } } }));
    const result = read();
    await expect(result).rejects.not.toBeInstanceOf(ConnectorUnauthorizedError);
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
});

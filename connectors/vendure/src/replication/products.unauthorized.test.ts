import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError, type SyncContext } from '@tallyui/core';
import { ConnectorUnauthorizedError as ExportedError } from '../index';
import { vendureProductSync } from '../sync/products';
import { gql } from './products';

const context: SyncContext = { connectorId: 'vendure', baseUrl: 'https://vendure.test', headers: { Authorization: 'Bearer expired' } };
const message = 'You are not currently authorized to perform this action';
const forbidden = { errors: [{ message, extensions: { code: 'FORBIDDEN' } }], data: null };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => vi.restoreAllMocks());

/** Routes each fetch by its query text: the probe gets `probe()`, every other request `answer`. */
function stubFetch(probe: () => Response | Promise<Response>, answer: unknown = forbidden) {
  const probes: RequestInit[] = [];
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    if (String(init?.body).includes('activeAdministrator')) {
      probes.push(init!);
      return probe();
    }
    return json(answer);
  });
  return { spy, probes };
}

it('re-exports the core unauthorized error', () => expect(ExportedError).toBe(ConnectorUnauthorizedError));

describe.each([
  { name: 'replication gql', request: (ctx: SyncContext) => gql(ctx, 'query { products { totalItems } }') },
  { name: 'sync gql', request: (ctx: SyncContext) => vendureProductSync.fetchAllIds(ctx) },
])('$name', ({ request }) => {
  it('gql rejects with ConnectorUnauthorizedError for HTTP 401 and 403, without a probe', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    for (const status of [401, 403]) {
      fetchSpy.mockResolvedValueOnce(json(forbidden, status));
      const result = request(context);
      await expect(result).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
      await expect(result).rejects.toMatchObject({ code: status === 403 ? 'forbidden' : 'unauthorized', status });
      await expect(result).rejects.toThrow(String(status));
    }
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('FORBIDDEN with a null activeAdministrator signs out, after exactly one probe', async () => {
    const { probes } = stubFetch(() => json({ data: { activeAdministrator: null } }));
    const result = request(context);
    await expect(result).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
    await expect(result).rejects.toMatchObject({ code: 'unauthorized', status: 401 });
    await expect(result).rejects.toThrow(`Vendure GraphQL error: ${message}`);
    expect(probes).toHaveLength(1);
  });

  it('FORBIDDEN with a live administrator is forbidden (a missing permission), after exactly one probe', async () => {
    const { probes } = stubFetch(() => json({ data: { activeAdministrator: { id: '1' } } }));
    const result = request(context);
    await expect(result).rejects.toBeInstanceOf(Error);
    await expect(result).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
    await expect(result).rejects.toMatchObject({ status: 403, code: 'forbidden' });
    await expect(result).rejects.toThrow('although the session is signed in (a permission is missing)');
    await expect(result).rejects.toThrow(message);
    expect(probes).toHaveLength(1);
  });

  it.each([
    { name: 'a network error', probe: () => Promise.reject(new TypeError('fetch failed')) },
    { name: 'HTTP 500', probe: () => json({ data: { activeAdministrator: null } }, 500) },
    { name: 'GraphQL errors', probe: () => json({ errors: [{ message: 'boom' }], data: { activeAdministrator: null } }) },
    { name: 'bad JSON', probe: () => new Response('not json') },
  ])('a probe failing with $name is transient: a plain Error, after exactly one probe', async ({ probe }) => {
    const { probes } = stubFetch(probe);
    const result = request(context);
    await expect(result).rejects.toBeInstanceOf(Error);
    await expect(result).rejects.not.toBeInstanceOf(ConnectorUnauthorizedError);
    await expect(result).rejects.toThrow(`FORBIDDEN: ${message} (the session check failed`);
    expect(probes).toHaveLength(1);
  });

  it.each([
    { path: ['products'], what: `products: ${message}` },
    { path: ['product', 'variants'], what: `product.variants: ${message}` },
    { path: ['products', 'items', 0, 'name'], what: `products.items.0.name: ${message}` },
    { path: undefined, what: message },
  ])('the errors name what was refused ($what); signing out keeps the message as is', async ({ path, what }) => {
    const answer = { errors: [{ message, path, extensions: { code: 'FORBIDDEN' } }], data: null };
    const messageFor = async (probe: unknown) => {
      stubFetch(() => json(probe), answer);
      const error = await request(context).catch((e: unknown) => e);
      vi.restoreAllMocks();
      return (error as Error).message;
    };
    expect(await messageFor({ data: { activeAdministrator: { id: '1' } } })).toBe(`Vendure GraphQL error: FORBIDDEN: the store refused this request although the session is signed in (a permission is missing): ${what}`);
    expect(await messageFor({ errors: [{ message: 'boom' }] })).toBe(`Vendure GraphQL error: FORBIDDEN: ${what} (the session check failed, so this may be transient)`);
    expect(await messageFor({ data: { activeAdministrator: null } })).toBe(`Vendure GraphQL error: ${message}`);
  });

  it('names every refused path in the answer\'s order, after exactly one probe per response', async () => {
    const answer = { data: null, errors: [
      { message, path: ['products'], extensions: { code: 'FORBIDDEN' } },
      { message: 'Other error', path: ['channel'], extensions: { code: 'OTHER' } },
      { message, path: ['product', 'variants'], extensions: { code: 'FORBIDDEN' } },
    ] };
    const what = `products: ${message}; product.variants: ${message}`;
    for (const [probe, expected, forbidden] of [
      [{ data: { activeAdministrator: { id: '1' } } }, `Vendure GraphQL error: FORBIDDEN: the store refused this request although the session is signed in (a permission is missing): ${what}`, true],
      [{ errors: [{ message: 'boom' }] }, `Vendure GraphQL error: FORBIDDEN: ${what} (the session check failed, so this may be transient)`, false],
    ] as const) {
      const { probes } = stubFetch(() => json(probe), answer);
      const error = await request(context).catch((e: unknown) => e);
      expect(error instanceof ConnectorUnauthorizedError).toBe(forbidden);
      expect((error as Error).message).toBe(expected);
      expect(probes).toHaveLength(1);
      vi.restoreAllMocks();
    }
  });

  it('the probe sends the failed request\'s headers and signal to the same admin-api', async () => {
    const controller = new AbortController();
    const { spy, probes } = stubFetch(() => json({ data: { activeAdministrator: null } }));
    await expect(request({ ...context, signal: controller.signal })).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
    expect(spy.mock.calls.map(([url]) => url)).toEqual(['https://vendure.test/admin-api', 'https://vendure.test/admin-api']);
    expect(probes[0].headers).toMatchObject({ Authorization: 'Bearer expired' });
    expect(probes[0].signal).toBe(controller.signal);
  });

  it('an abort during the probe propagates as the abort', async () => {
    const controller = new AbortController();
    stubFetch(() => {
      controller.abort();
      return Promise.reject(controller.signal.reason);
    });
    const error = await request({ ...context, signal: controller.signal }).catch((e: unknown) => e);
    expect(error).toBe(controller.signal.reason);
    expect(error).toMatchObject({ name: 'AbortError' });
  });

  it('detects FORBIDDEN after another GraphQL error', async () => {
    stubFetch(() => json({ data: { activeAdministrator: null } }), { errors: [
      { message: 'Other error', extensions: { code: 'OTHER' } },
      { message, extensions: { code: 'FORBIDDEN' } },
    ] });
    const result = request(context);
    await expect(result).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
    await expect(result).rejects.toThrow(message);
  });

  it('keeps HTTP 500 a plain Error with the same message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('Server error', { status: 500 }));
    const result = request(context);
    await expect(result).rejects.toBeInstanceOf(Error);
    await expect(result).rejects.not.toBeInstanceOf(ConnectorUnauthorizedError);
    await expect(result).rejects.toThrow('Vendure API error: 500');
  });
});

it('keeps other replication GraphQL errors plain with the same message, without a probe', async () => {
  const { spy } = stubFetch(() => json({ data: { activeAdministrator: null } }), { errors: [{ message: 'Other error', extensions: { code: 'OTHER' } }] });
  const result = gql(context, 'query { products { totalItems } }');
  await expect(result).rejects.toBeInstanceOf(Error);
  await expect(result).rejects.not.toBeInstanceOf(ConnectorUnauthorizedError);
  await expect(result).rejects.toThrow('Vendure GraphQL error: Other error');
  expect(spy).toHaveBeenCalledTimes(1);
});

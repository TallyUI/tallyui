import { describe, it, expect, vi } from 'vitest';
import { SignInError } from '@tallyui/core';
import { readCapabilities } from './capabilities';

function fetchReturning(body: unknown, status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
}

describe('readCapabilities', () => {
  it('gives the max of the supported versions', async () => {
    const fetch = fetchReturning({ contracts: { 'order.create': [1, 2] } });
    await expect(readCapabilities('https://medusa.test', {}, { fetch })).resolves.toEqual({ orderCreate: 2 });
  });

  it('gives the only supported version', async () => {
    const fetch = fetchReturning({ contracts: { 'order.create': [1] } });
    await expect(readCapabilities('https://medusa.test', {}, { fetch })).resolves.toEqual({ orderCreate: 1 });
  });

  it('gives 1 on a 404 (an old plugin)', async () => {
    const fetch = fetchReturning({}, 404);
    await expect(readCapabilities('https://medusa.test', {}, { fetch })).resolves.toEqual({ orderCreate: 1 });
  });

  it('gives 1 on a 200 without contracts', async () => {
    const fetch = fetchReturning({ ok: true });
    await expect(readCapabilities('https://medusa.test', {}, { fetch })).resolves.toEqual({ orderCreate: 1 });
  });

  it('gives 1 when the body is not JSON', async () => {
    const fetch = vi.fn(async () => new Response('not json', { status: 200 }));
    await expect(readCapabilities('https://medusa.test', {}, { fetch })).resolves.toEqual({ orderCreate: 1 });
  });

  it('gives 1 when the list has no valid positive safe integers', async () => {
    const fetch = fetchReturning({ contracts: { 'order.create': ['2', 2.5, -1] } });
    await expect(readCapabilities('https://medusa.test', {}, { fetch })).resolves.toEqual({ orderCreate: 1 });
  });

  it('gives undefined (unknown) on a network error', async () => {
    const fetch = vi.fn(async () => { throw new TypeError('fetch failed'); });
    await expect(readCapabilities('https://medusa.test', {}, { fetch })).resolves.toBeUndefined();
  });

  it('gives undefined (unknown) on a 500', async () => {
    const fetch = fetchReturning({}, 500);
    await expect(readCapabilities('https://medusa.test', {}, { fetch })).resolves.toBeUndefined();
  });

  it('throws SignInError on a 401, never version 1', async () => {
    const fetch = fetchReturning({}, 401);
    await expect(readCapabilities('https://medusa.test', {}, { fetch })).rejects.toBeInstanceOf(SignInError);
    await expect(readCapabilities('https://medusa.test', {}, { fetch })).rejects.toMatchObject({ code: 'invalid_credentials' });
  });

  it('reads with a GET carrying the given Authorization header', async () => {
    const fetch = fetchReturning({ contracts: { 'order.create': [1] } });
    await readCapabilities('https://medusa.test', { Authorization: 'Bearer tok' }, { fetch });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://medusa.test/tally/v1/info');
    expect(init?.method).toBe('GET');
    expect(init?.headers).toEqual({ Authorization: 'Bearer tok' });
  });
});

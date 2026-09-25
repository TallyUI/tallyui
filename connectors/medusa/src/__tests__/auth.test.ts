import { afterEach, describe, it, expect, vi } from 'vitest';
import { SignInError, type SyncContext } from '@tallyui/core';
import { medusaAdminUserAuth, medusaAdminUserConnector, medusaConnector, medusaSecretKeyAuth } from '../index';

describe('Medusa auth', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sends the secret API key over HTTP Basic auth, key as username', () => {
    expect(medusaConnector.auth).toBe(medusaSecretKeyAuth);
    const headers = medusaConnector.auth.getHeaders({ api_token: 'sk_test_123' });
    expect(headers.Authorization).toBe(`Basic ${btoa('sk_test_123:')}`);
  });

  it('sends the admin user JWT as Bearer auth', () => {
    expect(medusaAdminUserAuth.getHeaders({ token: 'jwt_abc' })).toEqual({
      Authorization: 'Bearer jwt_abc',
    });
  });

  it('omits auth headers when the token is missing or empty', () => {
    expect(medusaAdminUserAuth.getHeaders({})).toEqual({});
    expect(medusaAdminUserAuth.getHeaders({ token: '' })).toEqual({});
  });

  it('declares the admin user sign-in fields', () => {
    expect(medusaAdminUserAuth.fields.map(f => f.key)).toEqual(['url', 'email', 'password']);
  });

  it('shares connector identity and objects with the secret-key connector', () => {
    expect(medusaAdminUserConnector.id).toBe(medusaConnector.id);
    expect(medusaAdminUserConnector.schemas).toBe(medusaConnector.schemas);
    expect(medusaAdminUserConnector.traits).toBe(medusaConnector.traits);
    expect(medusaAdminUserConnector.sync).toBe(medusaConnector.sync);
    expect(medusaAdminUserConnector.replication).toBe(medusaConnector.replication);
    expect(medusaAdminUserConnector.auth).toBe(medusaAdminUserAuth);
  });

  it('sends the admin user auth headers on a replication request', async () => {
    const context: SyncContext = {
      connectorId: medusaAdminUserConnector.id,
      baseUrl: 'https://my-medusa-backend.com',
      headers: medusaAdminUserConnector.auth.getHeaders({ token: 'jwt_abc' }),
    };
    // Answer every call, so nothing reaches the real fetch, whatever the feeds request.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ products: [], variants: [], count: 0, offset: 0, limit: 100 }), { status: 200 }),
    );

    await medusaAdminUserConnector.replication!.products!.pull!.handler(undefined, 100, context);

    expect(fetchSpy.mock.calls.length).toBeGreaterThan(0);
    for (const [, options] of fetchSpy.mock.calls) {
      expect(options?.headers).toMatchObject({
        Authorization: 'Bearer jwt_abc',
      });
    }
  });
});

describe('Medusa sign-in', () => {
  const b64url = (value: unknown) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = (payload: unknown) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`;
  // The info route (ADR-062) is a second fetch after a successful sign-in; a 404 (an old
  // plugin) is the default so tests that don't care about capabilities need no changes.
  const signIn = (body: unknown, status = 200, caps: { body?: unknown; status?: number } = { status: 404 }) => {
    const fetch = vi.fn(async (url: string | URL | Request, _init?: RequestInit) =>
      String(url).endsWith('/tally/v1/info')
        ? new Response(JSON.stringify(caps.body ?? {}), { status: caps.status ?? 404 })
        : new Response(JSON.stringify(body), { status }));
    return { fetch, result: medusaAdminUserAuth.signIn!('https://medusa.test', { email: 'admin@test.com', password: 'pw' }, { fetch }) };
  };

  it('posts email and password to emailpass and returns the token with expiresAt from its exp', async () => {
    const token = jwt({ actor_id: 'user_1', exp: 1790000000, name: 'ÿÿÿÿ' });
    expect(token.split('.')[1]).toMatch(/[-_]/); // exercises the base64url alphabet
    const { fetch, result } = signIn({ token });
    await expect(result).resolves.toEqual({ token, expiresAt: new Date(1790000000 * 1000).toISOString(), capabilities: { orderCreate: 1 } });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://medusa.test/auth/user/emailpass');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init!.body as string)).toEqual({ email: 'admin@test.com', password: 'pw' });
  });

  it('leaves expiresAt undefined when the token has no exp', async () => {
    await expect(signIn({ token: jwt({ actor_id: 'user_1' }) }).result).resolves.toMatchObject({ expiresAt: undefined });
    await expect(signIn({ token: 'not-a-jwt' }).result).resolves.toEqual({ token: 'not-a-jwt', expiresAt: undefined, capabilities: { orderCreate: 1 } });
  });

  it('rejects a 401 as invalid_credentials', async () => {
    const { result } = signIn({ type: 'unauthorized', message: 'Invalid email or password' }, 401);
    await expect(result).rejects.toBeInstanceOf(SignInError);
    await expect(result).rejects.toMatchObject({ code: 'invalid_credentials', message: 'Invalid email or password' });
  });

  it('rejects a 401 with a plain-text body as invalid_credentials, not server_error', async () => {
    const fetch = vi.fn(async () => new Response('Unauthorized', { status: 401 }));
    const result = medusaAdminUserAuth.signIn!('https://medusa.test', { email: 'admin@test.com', password: 'pw' }, { fetch });
    await expect(result).rejects.toBeInstanceOf(SignInError);
    await expect(result).rejects.toMatchObject({ code: 'invalid_credentials' });
  });

  it('rejects a location body as unsupported', async () => {
    await expect(signIn({ location: 'https://idp.test/authorize' }).result).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('rejects mfa_required as unsupported and never returns the token', async () => {
    await expect(signIn({ mfa_required: true, token: 'sneaky' }).result)
      .rejects.toMatchObject({ code: 'unsupported' });
  });

  it('rejects verification_required as unsupported', async () => {
    await expect(signIn({ verification_required: true }).result).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('rejects other non-OK statuses as server_error with the status and the Medusa message', async () => {
    await expect(signIn({ type: 'server_error', message: 'Something went wrong' }, 500).result)
      .rejects.toMatchObject({ code: 'server_error', status: 500, message: 'Something went wrong' });
  });

  it('rejects a malformed JSON body as server_error with the status', async () => {
    const fetch = vi.fn(async () => new Response('not json', { status: 200 }));
    const result = medusaAdminUserAuth.signIn!('https://medusa.test', { email: 'admin@test.com', password: 'pw' }, { fetch });
    await expect(result).rejects.toMatchObject({ code: 'server_error', status: 200 });
  });

  it('rejects a 200 with a null body as server_error', async () => {
    await expect(signIn(null).result).rejects.toMatchObject({ code: 'server_error', status: 200 });
  });

  it('rejects a 200 with no token as server_error', async () => {
    await expect(signIn({}).result).rejects.toMatchObject({ code: 'server_error', status: 200 });
  });

  it('rejects a 200 with a numeric token as server_error', async () => {
    await expect(signIn({ token: 12345 }).result).rejects.toMatchObject({ code: 'server_error', status: 200 });
  });

  it('has no sign-in for secret API keys', () => {
    expect(medusaSecretKeyAuth.signIn).toBeUndefined();
  });

  it('maps a network failure to a failed SignInError naming the base URL', async () => {
    const fetch = vi.fn(async () => { throw new TypeError('fetch failed'); });
    const result = medusaAdminUserAuth.signIn!('https://medusa.test', { email: 'admin@test.com', password: 'pw' }, { fetch });
    await expect(result).rejects.toBeInstanceOf(SignInError);
    await expect(result).rejects.toMatchObject({ code: 'failed', message: expect.stringContaining('https://medusa.test') });
  });

  it('rethrows an abort unchanged instead of wrapping it', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    const fetch = vi.fn(async () => { throw abortError; });
    const result = medusaAdminUserAuth.signIn!('https://medusa.test', { email: 'admin@test.com', password: 'pw' }, { fetch });
    await expect(result).rejects.toBe(abortError);
  });

  it('returns capabilities: { orderCreate: 2 } when the info route says [1, 2] (ADR-062)', async () => {
    const { result } = signIn({ token: jwt({ actor_id: 'user_1' }) }, 200, { status: 200, body: { contracts: { 'order.create': [1, 2] } } });
    await expect(result).resolves.toMatchObject({ capabilities: { orderCreate: 2 } });
  });

  it('returns capabilities: { orderCreate: 1 } when the info route 404s (an old plugin)', async () => {
    const { result } = signIn({ token: jwt({ actor_id: 'user_1' }) }, 200, { status: 404 });
    await expect(result).resolves.toMatchObject({ capabilities: { orderCreate: 1 } });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { SignInError } from '@tallyui/core';
import { vendureAuth, vendureConnector } from './index';

const loginResponse = (login: unknown, headers: Record<string, string> = {}, status = 200) =>
  new Response(JSON.stringify({ data: { login } }), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const signIn = (response: Response) => {
  const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => response);
  const result = vendureAuth.signIn!('https://vendure.test', { email: 'superadmin', password: 'pw' }, { fetch });
  return { fetch, result };
};

describe('Vendure sign-in', () => {
  it('is the auth of the Vendure connector', () => {
    expect(vendureConnector.auth).toBe(vendureAuth);
    expect(vendureAuth.fields.map((f) => f.key)).toEqual(['url', 'email', 'password', 'channel_token']);
  });

  it('posts the login mutation and returns the token from the vendure-auth-token header', async () => {
    const { fetch, result } = signIn(loginResponse({ __typename: 'CurrentUser', id: '1' }, { 'vendure-auth-token': 'tok_123' }));
    await expect(result).resolves.toEqual({ token: 'tok_123', expiresAt: undefined });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://vendure.test/admin-api');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(init!.body as string);
    expect(body.query).toContain('login(username: $email, password: $password)');
    expect(body.variables).toEqual({ email: 'superadmin', password: 'pw' });
  });

  it('rejects INVALID_CREDENTIALS_ERROR as invalid_credentials', async () => {
    const { result } = signIn(loginResponse({ __typename: 'InvalidCredentialsError', errorCode: 'INVALID_CREDENTIALS_ERROR', message: 'The provided credentials are invalid' }));
    await expect(result).rejects.toBeInstanceOf(SignInError);
    await expect(result).rejects.toMatchObject({ code: 'invalid_credentials', message: 'The provided credentials are invalid' });
  });

  it('rejects a CurrentUser without the token header as unsupported', async () => {
    const { result } = signIn(loginResponse({ __typename: 'CurrentUser', id: '1' }));
    await expect(result).rejects.toMatchObject({ code: 'unsupported', message: expect.stringContaining('bearer') });
  });

  it('rejects NATIVE_AUTH_STRATEGY_ERROR as unsupported', async () => {
    await expect(signIn(loginResponse({ __typename: 'NativeAuthStrategyError', errorCode: 'NATIVE_AUTH_STRATEGY_ERROR', message: 'No native auth' })).result)
      .rejects.toMatchObject({ code: 'unsupported', message: 'No native auth' });
  });

  it('rejects an unknown ErrorResult as server_error', async () => {
    await expect(signIn(loginResponse({ __typename: 'SomethingElseError', errorCode: 'SOME_OTHER_ERROR', message: 'Unexpected' })).result)
      .rejects.toMatchObject({ code: 'server_error', status: 200, message: 'Unexpected' });
  });

  it('rejects GraphQL errors as server_error', async () => {
    await expect(signIn(new Response(JSON.stringify({ errors: [{ message: 'Cannot query field' }] }), { status: 200 })).result)
      .rejects.toMatchObject({ code: 'server_error', status: 200, message: 'Cannot query field' });
  });

  it('rejects a non-OK status as server_error with the status', async () => {
    await expect(signIn(new Response(JSON.stringify({ data: {} }), { status: 502 })).result)
      .rejects.toMatchObject({ code: 'server_error', status: 502 });
  });

  it('rejects a malformed JSON body as server_error with the status', async () => {
    await expect(signIn(new Response('Bad gateway', { status: 200 })).result)
      .rejects.toMatchObject({ code: 'server_error', status: 200 });
  });

  it('names the default header and a renamed authTokenHeaderKey when the token header is missing', async () => {
    const { result } = signIn(loginResponse({ __typename: 'CurrentUser', id: '1' }));
    await expect(result).rejects.toMatchObject({ code: 'unsupported', message: expect.stringContaining('authTokenHeaderKey') });
    await expect(result).rejects.toMatchObject({ message: expect.stringContaining('vendure-auth-token') });
  });

  it('maps a network failure to a failed SignInError naming the base URL', async () => {
    const fetch = vi.fn(async () => { throw new TypeError('fetch failed'); });
    const result = vendureAuth.signIn!('https://vendure.test', { email: 'superadmin', password: 'pw' }, { fetch });
    await expect(result).rejects.toBeInstanceOf(SignInError);
    await expect(result).rejects.toMatchObject({ code: 'failed', message: expect.stringContaining('https://vendure.test') });
  });

  it('rethrows an abort unchanged instead of wrapping it', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    const fetch = vi.fn(async () => { throw abortError; });
    const result = vendureAuth.signIn!('https://vendure.test', { email: 'superadmin', password: 'pw' }, { fetch });
    await expect(result).rejects.toBe(abortError);
  });
});

describe('Vendure getHeaders', () => {
  it('sends a signed-in token as Bearer auth', () => {
    expect(vendureAuth.getHeaders({ url: 'https://vendure.test', token: 'tok_123' })).toEqual({ Authorization: 'Bearer tok_123' });
  });

  it('accepts the deprecated auth_token as a fallback for token', () => {
    expect(vendureAuth.getHeaders({ auth_token: 'old_1' })).toEqual({ Authorization: 'Bearer old_1' });
    expect(vendureAuth.getHeaders({ token: 'tok_123', auth_token: 'old_1' })).toEqual({ Authorization: 'Bearer tok_123' });
    expect(vendureAuth.getHeaders({ api_key: 'key_1', auth_token: 'old_1' })).toEqual({ 'vendure-api-key': 'key_1' });
  });

  it('prefers an API key over a token', () => {
    expect(vendureAuth.getHeaders({ api_key: 'key_1', token: 'tok_123' })).toEqual({ 'vendure-api-key': 'key_1' });
  });

  it('adds the channel token when set', () => {
    expect(vendureAuth.getHeaders({ token: 'tok_123', channel_token: 'ch_1' })).toEqual({ Authorization: 'Bearer tok_123', 'vendure-token': 'ch_1' });
    expect(vendureAuth.getHeaders({ api_key: 'key_1', channel_token: 'ch_1' })).toEqual({ 'vendure-api-key': 'key_1', 'vendure-token': 'ch_1' });
  });

  it('sends no auth headers without credentials', () => {
    expect(vendureAuth.getHeaders({})).toEqual({});
    expect(vendureAuth.getHeaders({ token: '', channel_token: '' })).toEqual({});
  });

  it('warns once per module lifetime when auth_token is used, and never when token is set', async () => {
    vi.resetModules();
    const { vendureAuth: freshVendureAuth } = await import('./index');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    freshVendureAuth.getHeaders({ auth_token: 'x' });
    freshVendureAuth.getHeaders({ auth_token: 'x' });
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
    vi.resetModules();
    const { vendureAuth: anotherFreshVendureAuth } = await import('./index');
    const warnSpy2 = vi.spyOn(console, 'warn').mockImplementation(() => {});

    anotherFreshVendureAuth.getHeaders({ token: 'x' });
    expect(warnSpy2).not.toHaveBeenCalled();
    warnSpy2.mockRestore();
  });
});

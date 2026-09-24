import { afterEach, describe, it, expect, vi } from 'vitest';
import type { SyncContext } from '@tallyui/core';
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
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ products: [], count: 0 }), { status: 200 }),
    ).mockResolvedValueOnce(
      new Response(JSON.stringify({ products: [], count: 0, offset: 0, limit: 100 }), { status: 200 }),
    );

    await medusaAdminUserConnector.replication!.products!.pull!.handler(undefined, 100, context);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    for (const [, options] of fetchSpy.mock.calls) {
      expect(options?.headers).toMatchObject({
        Authorization: 'Bearer jwt_abc',
      });
    }
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError, type SyncContext } from '@tallyui/core';
import { ConnectorUnauthorizedError as ExportedError } from '../index';
import { vendureProductSync } from '../sync/products';
import { gql } from './products';

const context: SyncContext = { connectorId: 'vendure', baseUrl: 'https://vendure.test', headers: { Authorization: 'Bearer expired' } };
const message = 'You are not currently authorized to perform this action';
afterEach(() => vi.restoreAllMocks());

it('re-exports the core unauthorized error', () => expect(ExportedError).toBe(ConnectorUnauthorizedError));

describe.each([
  { name: 'replication gql', request: () => gql(context, 'query { products { totalItems } }') },
  { name: 'sync gql', request: () => vendureProductSync.fetchAllIds(context) },
])('$name', ({ request }) => {
  it('gql rejects with ConnectorUnauthorizedError for 401, 403 and a FORBIDDEN GraphQL error', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    for (const status of [401, 403, 200]) {
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ message, extensions: { code: 'FORBIDDEN' } }] }), { status }));
      const result = request();
      await expect(result).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
      await expect(result).rejects.toMatchObject({ code: 'unauthorized', status: status === 200 ? undefined : status });
      await expect(result).rejects.toThrow(status === 200 ? message : String(status));
    }
  });

  it('detects FORBIDDEN after another GraphQL error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ errors: [
      { message: 'Other error', extensions: { code: 'OTHER' } },
      { message, extensions: { code: 'FORBIDDEN' } },
    ] })));
    const result = request();
    await expect(result).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
    await expect(result).rejects.toThrow(message);
  });

  it('keeps HTTP 500 a plain Error with the same message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('Server error', { status: 500 }));
    const result = request();
    await expect(result).rejects.toBeInstanceOf(Error);
    await expect(result).rejects.not.toBeInstanceOf(ConnectorUnauthorizedError);
    await expect(result).rejects.toThrow('Vendure API error: 500');
  });
});

it('keeps other replication GraphQL errors plain with the same message', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ message: 'Other error', extensions: { code: 'OTHER' } }] })));
  const result = gql(context, 'query { products { totalItems } }');
  await expect(result).rejects.toBeInstanceOf(Error);
  await expect(result).rejects.not.toBeInstanceOf(ConnectorUnauthorizedError);
  await expect(result).rejects.toThrow('Vendure GraphQL error: Other error');
});

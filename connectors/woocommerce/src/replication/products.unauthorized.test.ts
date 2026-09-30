import { afterEach, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError, errorKind, type SyncContext } from '@tallyui/core';
import { ConnectorUnauthorizedError as ExportedError, WooTokenRefusedError } from '../index';
import { checkResponse, wooProductReplication } from './products';

const context: SyncContext = {
  connectorId: 'woocommerce',
  baseUrl: 'https://example.com/wp-json/wcpos/v2',
  headers: { Authorization: 'Bearer expired', 'X-WCPOS': '1' },
};
afterEach(() => vi.restoreAllMocks());

it('re-exports the core unauthorized error', () => expect(ExportedError).toBe(ConnectorUnauthorizedError));

it.each([401, 403])('rejects the product pull with ConnectorUnauthorizedError (HTTP %i)', async (status) => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('Unauthorized', { status }));
  const result = wooProductReplication.pull.handler(undefined, 100, context);
  await expect(result).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
  await expect(result).rejects.toMatchObject({ code: status === 403 ? 'forbidden' : 'unauthorized', status });
  await expect(result).rejects.toThrow(`WooCommerce API error: ${status}`);
});

it.each([
  JSON.stringify({ code: 'woocommerce_pos_rest_forbidden' }),
  JSON.stringify({ code: 'rest_forbidden' }),
  'not json',
])('keeps a 403 response with %s forbidden', async (body) => {
  const result = checkResponse(new Response(body, { status: 403 }));
  await expect(result).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
  await expect(result).rejects.toMatchObject({ status: 403, code: 'forbidden' });
});

it('maps a jwt_auth 403 to a store-class token refusal that names no version', async () => {
  const error = await checkResponse(new Response(JSON.stringify({ code: 'jwt_auth_invalid_token' }), { status: 403 })).catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(WooTokenRefusedError);
  expect(error).toMatchObject({
    code: 'store_misconfigured', fixedBy: 'store', fix: "check the WCPOS plugin's JWT settings", storeCode: 'jwt_auth_invalid_token',
  });
  expect((error as Error).message).not.toMatch(/1\.10|update/i);
  expect(errorKind(error)).toBe('store');
});

it('keeps HTTP 500 a plain error', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }));
  const result = wooProductReplication.pull.handler(undefined, 100, context);
  await expect(result).rejects.toThrow('WooCommerce API error: 500');
  await expect(result).rejects.not.toBeInstanceOf(ConnectorUnauthorizedError);
});

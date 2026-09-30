import { afterEach, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError, type SyncContext } from '@tallyui/core';
import { ConnectorUnauthorizedError as ExportedError } from '../index';
import { wooProductReplication } from './products';

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

it('keeps HTTP 500 a plain error', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }));
  const result = wooProductReplication.pull.handler(undefined, 100, context);
  await expect(result).rejects.toThrow('WooCommerce API error: 500');
  await expect(result).rejects.not.toBeInstanceOf(ConnectorUnauthorizedError);
});

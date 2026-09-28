import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError, StoreSettingsError, type SyncContext } from '@tallyui/core';
import { ConnectorUnauthorizedError as ExportedError } from '../index';
import { fetchByIds, fetchPages } from '../reconcile/ids';
import { fetchPages as fetchPricePages } from '../reconcile/prices';
import { medusaStockReconcile } from '../reconcile/stock';
import { medusaStoreSettings } from '../store-settings';
import { medusaProductReplication } from './products';
import { createMedusaVariantFeedReplication } from './variant-feed';

const context: SyncContext = { connectorId: 'medusa', baseUrl: 'https://medusa.test', headers: { Authorization: 'Bearer expired' } };
afterEach(() => vi.restoreAllMocks());

it('re-exports the core unauthorized error', () => expect(ExportedError).toBe(ConnectorUnauthorizedError));

describe.each([
  { name: 'product mark', request: () => medusaProductReplication.pull.handler(undefined, 100, context) },
  { name: 'product page', request: () => medusaProductReplication.pull.handler({ offset: 0, updated_at: '', pass_mark: '' }, 100, context) },
  { name: 'variant feed', request: () => createMedusaVariantFeedReplication().pull.handler(undefined, 100, context) },
  { name: 'id reconcile pages', request: () => fetchPages(context)[Symbol.asyncIterator]().next() },
  { name: 'id reconcile products', request: () => fetchByIds(['prod_1'], context) },
  { name: 'stock reconcile', request: () => medusaStockReconcile.fetchPages(context)[Symbol.asyncIterator]().next() },
  { name: 'price reconcile', request: () => fetchPricePages(context)[Symbol.asyncIterator]().next() },
  { name: 'store settings', request: () => medusaStoreSettings(context) },
])('$name', ({ name, request }) => {
  it.each([401, 403])('rejects with ConnectorUnauthorizedError for 401 and 403 (HTTP %i)', async (status) => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ message: 'Rejected token' }), { status }));
    const result = request();
    await expect(result).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
    await expect(result).rejects.toMatchObject({ code: 'unauthorized', status });
    await expect(result).rejects.toThrow('Rejected token');
  });

  it('keeps HTTP 500 the existing error class and message', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ message: 'Server error' }), { status: 500 }));
    const result = request();
    await expect(result).rejects.toBeInstanceOf(name === 'store settings' ? StoreSettingsError : Error);
    await expect(result).rejects.not.toBeInstanceOf(ConnectorUnauthorizedError);
    await expect(result).rejects.toThrow(name === 'store settings'
      ? 'Medusa store settings request failed (HTTP 500): Server error'
      : 'Medusa API error: 500: Server error');
  });
});

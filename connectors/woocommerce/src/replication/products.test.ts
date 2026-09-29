import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SyncContext } from '@tallyui/core';

import { woocommerceConnector, WooMissingUuidError } from '../index';
import { wooProductReplication } from './products';

const context: SyncContext = {
  connectorId: 'woocommerce',
  baseUrl: 'https://example.com/wp-json/wcpos/v2',
  headers: woocommerceConnector.auth.getHeaders({ token: 't' }),
};

describe('wooProductReplication.pull.handler', () => {
  it('is pull-only: products are server-owned', () => {
    expect(wooProductReplication.push).toBeUndefined();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches products from initial checkpoint (undefined)', async () => {
    const mockProducts = [
      { id: 1, uuid: 'abc', name: 'Widget', date_modified_gmt: '2026-01-01T00:00:00' },
      { id: 2, uuid: 'def', name: 'Gadget', date_modified_gmt: '2026-01-02T00:00:00' },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockProducts), { status: 200 }),
    );

    const result = await wooProductReplication.pull.handler(undefined, 100, context);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://example.com/wp-json/wcpos/v2/products?per_page=100&orderby=modified&order=asc',
      expect.objectContaining({
        headers: { ...context.headers, 'Content-Type': 'application/json' },
      }),
    );
    expect(result.documents).toHaveLength(2);
    expect(result.documents[0]._deleted).toBe(false);
    expect(result.checkpoint).toEqual({
      id: 'def',
      modified: '2026-01-02T00:00:00',
    });
  });

  it('fetches products after a checkpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    const checkpoint = { id: 'abc', modified: '2026-01-01T00:00:00' };
    const result = await wooProductReplication.pull.handler(checkpoint, 100, context);

    expect(result.documents).toHaveLength(0);

    const calledUrl = (globalThis.fetch as any).mock.calls[0][0];
    expect(calledUrl).toContain('modified_after=2026-01-01T00%3A00%3A00');
    expect(calledUrl).toContain('orderby=modified');
    expect(calledUrl).toContain('order=asc');
  });

  it('uses batchSize as per_page', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    await wooProductReplication.pull.handler(undefined, 25, context);

    const calledUrl = (globalThis.fetch as any).mock.calls[0][0];
    expect(calledUrl).toContain('per_page=25');
  });

  it('throws on non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );

    await expect(
      wooProductReplication.pull.handler(undefined, 100, context),
    ).rejects.toThrow('WooCommerce API error: 500');
  });

  it('returns lastCheckpoint when no products are returned', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    const checkpoint = { id: 'abc', modified: '2026-01-01T00:00:00' };
    const result = await wooProductReplication.pull.handler(checkpoint, 100, context);

    expect(result.checkpoint).toEqual(checkpoint);
  });

  it.each([undefined, null, '', 42])('rejects a page with a product that has no uuid', async (uuid) => {
    const mockProducts = [
      { id: 1, uuid: 'abc', name: 'Widget', date_modified_gmt: '2026-01-01T00:00:00' },
      { id: 42, uuid, name: 'No UUID', date_modified_gmt: '2026-03-01T00:00:00' },
      { id: 43, name: 'Also no UUID', date_modified_gmt: '2026-03-02T00:00:00' },
      { id: 2, uuid: 'def', name: 'Gadget', date_modified_gmt: '2026-03-03T00:00:00' },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockProducts), { status: 200 }),
    );

    const result = wooProductReplication.pull.handler(undefined, 100, context);

    await expect(result).rejects.toBeInstanceOf(WooMissingUuidError);
    await expect(result).rejects.toMatchObject({
      name: 'WooMissingUuidError',
      productId: 42,
      message: 'WooCommerce product 42 has no uuid: the store must run the WCPOS Free plugin (1.10.0 or later) and be reached through its wcpos/v2 routes',
    });
  });
});

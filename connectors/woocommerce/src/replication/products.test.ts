import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SyncContext } from '@tallyui/core';

import { wooProductReplication } from './products';

const context: SyncContext = {
  connectorId: 'woocommerce',
  baseUrl: 'https://example.com/wp-json/wc/v3',
  headers: { Authorization: 'Basic dGVzdDp0ZXN0' },
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

  it('falls back to id when uuid is missing', async () => {
    const mockProducts = [
      { id: 42, name: 'No UUID', date_modified_gmt: '2026-03-01T00:00:00' },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockProducts), { status: 200 }),
    );

    const result = await wooProductReplication.pull.handler(undefined, 100, context);

    expect(result.checkpoint.id).toBe('42');
  });
});

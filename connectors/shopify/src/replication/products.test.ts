import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SyncContext } from '@tallyui/core';

import { shopifyProductReplication } from './products';

const context: SyncContext = {
  connectorId: 'shopify',
  baseUrl: 'https://my-store.myshopify.com',
  headers: { 'X-Shopify-Access-Token': 'shpat_test_token' },
};

describe('shopifyProductReplication.pull.handler', () => {
  it('is pull-only: products are server-owned', () => {
    expect(shopifyProductReplication.push).toBeUndefined();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches products from initial checkpoint (undefined)', async () => {
    const mockProducts = [
      { id: 1001, title: 'Widget', updated_at: '2026-01-01T00:00:00Z' },
      { id: 1002, title: 'Gadget', updated_at: '2026-01-02T00:00:00Z' },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ products: mockProducts }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await shopifyProductReplication.pull.handler(undefined, 100, context);

    expect(result.documents).toHaveLength(2);
    expect(result.documents[0]._deleted).toBe(false);
    expect(result.documents[0].id).toBe('1001');
    expect(result.documents[1].id).toBe('1002');
    expect(result.checkpoint).toEqual({
      updated_at: '2026-01-02T00:00:00Z',
    });
  });

  it('passes updated_at_min when checkpoint is provided', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ products: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const checkpoint = { updated_at: '2026-01-01T00:00:00Z' };
    const result = await shopifyProductReplication.pull.handler(checkpoint, 100, context);

    expect(result.documents).toHaveLength(0);

    const calledUrl = (globalThis.fetch as any).mock.calls[0][0];
    expect(calledUrl).toContain('updated_at_min=2026-01-01T00%3A00%3A00Z');
  });

  it('follows cursor-based pagination via Link header', async () => {
    const page1 = [
      { id: 1001, title: 'Widget', updated_at: '2026-01-01T00:00:00Z' },
    ];
    const page2 = [
      { id: 1002, title: 'Gadget', updated_at: '2026-01-02T00:00:00Z' },
    ];

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ products: page1 }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            Link: '<https://my-store.myshopify.com/admin/api/2024-01/products.json?page_info=abc123&limit=1>; rel="next"',
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ products: page2 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const result = await shopifyProductReplication.pull.handler(undefined, 1, context);

    expect(result.documents).toHaveLength(2);
    expect(result.checkpoint).toEqual({
      updated_at: '2026-01-02T00:00:00Z',
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('throws on non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );

    await expect(
      shopifyProductReplication.pull.handler(undefined, 100, context),
    ).rejects.toThrow('Shopify API error: 500');
  });

  it('returns lastCheckpoint when no products are returned', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ products: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const checkpoint = { updated_at: '2026-01-01T00:00:00Z' };
    const result = await shopifyProductReplication.pull.handler(checkpoint, 100, context);

    expect(result.checkpoint).toEqual(checkpoint);
  });

  it('normalizes numeric IDs to strings', async () => {
    const mockProducts = [
      { id: 9999, title: 'Numeric ID', updated_at: '2026-03-01T00:00:00Z' },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ products: mockProducts }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await shopifyProductReplication.pull.handler(undefined, 100, context);

    expect(result.documents[0].id).toBe('9999');
  });
});

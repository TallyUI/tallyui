import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SyncContext } from '@tallyui/core';

import { shopifyProductReplication } from './products';

const context: SyncContext = {
  connectorId: 'shopify',
  baseUrl: 'https://my-store.myshopify.com',
  headers: { 'X-Shopify-Access-Token': 'shpat_test_token' },
};

describe('shopifyProductReplication.pull.handler', () => {
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

describe('shopifyProductReplication.push.handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends PUT for updates with product wrapper', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const conflicts = await shopifyProductReplication.push!.handler(
      [{
        newDocumentState: { id: '1001', title: 'Updated', _deleted: false } as any,
        assumedMasterState: { id: '1001', title: 'Old', _deleted: false } as any,
      }],
      context,
    );

    expect(conflicts).toHaveLength(0);
    const [url, opts] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toContain('/admin/api/2024-01/products/1001.json');
    expect(opts.method).toBe('PUT');
    const body = JSON.parse(opts.body);
    expect(body.product).toBeDefined();
    expect(body.product.title).toBe('Updated');
  });

  it('returns conflicts on server error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('conflict', { status: 409 }),
    );

    const conflicts = await shopifyProductReplication.push!.handler(
      [{
        newDocumentState: { id: '1001', title: 'Updated', _deleted: false } as any,
        assumedMasterState: { id: '1001', title: 'Server Version', _deleted: false } as any,
      }],
      context,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].title).toBe('Server Version');
  });

  it('returns conflicts on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const conflicts = await shopifyProductReplication.push!.handler(
      [{
        newDocumentState: { id: '1001', title: 'Updated', _deleted: false } as any,
        assumedMasterState: { id: '1001', title: 'Server Version', _deleted: false } as any,
      }],
      context,
    );

    expect(conflicts).toHaveLength(1);
  });

  it('does not return conflict when assumedMasterState is absent', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('error', { status: 500 }),
    );

    const conflicts = await shopifyProductReplication.push!.handler(
      [{
        newDocumentState: { id: '1001', title: 'New Product', _deleted: false } as any,
      }],
      context,
    );

    expect(conflicts).toHaveLength(0);
  });
});

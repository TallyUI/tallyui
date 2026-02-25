import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SyncContext } from '@tallyui/core';

import { medusaProductReplication } from './products';

const context: SyncContext = {
  connectorId: 'medusa',
  baseUrl: 'https://my-medusa-backend.com',
  headers: { Authorization: 'Bearer test_token' },
};

describe('medusaProductReplication.pull.handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches products from initial checkpoint (undefined)', async () => {
    const mockProducts = [
      { id: 'prod_01', title: 'Widget', updated_at: '2026-01-01T00:00:00Z' },
      { id: 'prod_02', title: 'Gadget', updated_at: '2026-01-02T00:00:00Z' },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ products: mockProducts }), { status: 200 }),
    );

    const result = await medusaProductReplication.pull.handler(undefined, 100, context);

    expect(result.documents).toHaveLength(2);
    expect(result.documents[0]._deleted).toBe(false);
    expect(result.checkpoint).toEqual({
      offset: 0,
      updated_at: '2026-01-02T00:00:00Z',
    });

    const calledUrl = (globalThis.fetch as any).mock.calls[0][0];
    expect(calledUrl).toContain('offset=0');
    expect(calledUrl).toContain('limit=100');
    expect(calledUrl).toContain('fields=');
  });

  it('passes updated_at filter and offset from checkpoint', async () => {
    const mockProducts = [
      { id: 'prod_03', title: 'Thingamajig', updated_at: '2026-02-01T00:00:00Z' },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ products: mockProducts }), { status: 200 }),
    );

    const checkpoint = { offset: 50, updated_at: '2026-01-15T00:00:00Z' };
    const result = await medusaProductReplication.pull.handler(checkpoint, 100, context);

    const calledUrl = (globalThis.fetch as any).mock.calls[0][0];
    expect(calledUrl).toContain('offset=50');
    expect(calledUrl).toContain('updated_at%5Bgte%5D=2026-01-15T00%3A00%3A00Z');

    // Batch smaller than batchSize resets offset to 0
    expect(result.checkpoint.offset).toBe(0);
  });

  it('advances offset when batch equals batchSize', async () => {
    const mockProducts = Array.from({ length: 25 }, (_, i) => ({
      id: `prod_${i}`,
      title: `Product ${i}`,
      updated_at: '2026-01-01T00:00:00Z',
    }));

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ products: mockProducts }), { status: 200 }),
    );

    const result = await medusaProductReplication.pull.handler(undefined, 25, context);

    expect(result.checkpoint.offset).toBe(25);
  });

  it('throws on non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );

    await expect(
      medusaProductReplication.pull.handler(undefined, 100, context),
    ).rejects.toThrow('Medusa API error: 500');
  });

  it('returns lastCheckpoint when no products are returned', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ products: [] }), { status: 200 }),
    );

    const checkpoint = { offset: 0, updated_at: '2026-01-01T00:00:00Z' };
    const result = await medusaProductReplication.pull.handler(checkpoint, 100, context);

    expect(result.checkpoint).toEqual(checkpoint);
  });
});

describe('medusaProductReplication.push.handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends POST for updates', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const conflicts = await medusaProductReplication.push!.handler(
      [{
        newDocumentState: { id: 'prod_01', title: 'Updated', _deleted: false } as any,
        assumedMasterState: { id: 'prod_01', title: 'Old', _deleted: false } as any,
      }],
      context,
    );

    expect(conflicts).toHaveLength(0);
    const [url, opts] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toContain('/admin/products/prod_01');
    expect(opts.method).toBe('POST');
  });

  it('returns conflicts on server error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('conflict', { status: 409 }),
    );

    const conflicts = await medusaProductReplication.push!.handler(
      [{
        newDocumentState: { id: 'prod_01', title: 'Updated', _deleted: false } as any,
        assumedMasterState: { id: 'prod_01', title: 'Server Version', _deleted: false } as any,
      }],
      context,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].title).toBe('Server Version');
  });

  it('returns conflicts on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const conflicts = await medusaProductReplication.push!.handler(
      [{
        newDocumentState: { id: 'prod_01', title: 'Updated', _deleted: false } as any,
        assumedMasterState: { id: 'prod_01', title: 'Server Version', _deleted: false } as any,
      }],
      context,
    );

    expect(conflicts).toHaveLength(1);
  });

  it('does not return conflict when assumedMasterState is absent', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('error', { status: 500 }),
    );

    const conflicts = await medusaProductReplication.push!.handler(
      [{
        newDocumentState: { id: 'prod_01', title: 'New Product', _deleted: false } as any,
      }],
      context,
    );

    expect(conflicts).toHaveLength(0);
  });
});

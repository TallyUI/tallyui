import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SyncContext } from '@tallyui/core';

import { medusaProductReplication } from './products';

const context: SyncContext = {
  connectorId: 'medusa',
  baseUrl: 'https://my-medusa-backend.com',
  headers: { Authorization: 'Bearer test_token' },
};

describe('medusaProductReplication.pull.handler', () => {
  it('is pull-only: products are server-owned', () => {
    expect(medusaProductReplication.push).toBeUndefined();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches products from initial checkpoint (undefined)', async () => {
    const mockProducts = [
      { id: 'prod_01', title: 'Widget', updated_at: '2026-01-01T00:00:00Z' },
      { id: 'prod_02', title: 'Gadget', updated_at: '2026-01-02T00:00:00Z' },
    ];

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ products: [mockProducts[1]] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ products: mockProducts, count: 2 }), { status: 200 }));

    const result = await medusaProductReplication.pull.handler(undefined, 100, context);

    expect(result.documents).toHaveLength(2);
    expect(result.documents[0]._deleted).toBe(false);
    expect(result.checkpoint).toEqual({
      offset: 0,
      updated_at: '2026-01-02T00:00:00Z',
    });

    const markUrl = new URL((globalThis.fetch as any).mock.calls[0][0]);
    expect(Object.fromEntries(markUrl.searchParams)).toEqual({ limit: '1', order: '-updated_at', fields: 'id,updated_at' });
    const calledUrl = (globalThis.fetch as any).mock.calls[1][0];
    expect(calledUrl).toContain('offset=0');
    expect(calledUrl).toContain('limit=100');
    expect(calledUrl).toContain('fields=');
  });

  it.each([undefined, '2026-02-01T00:00:00Z'])('loads an old checkpoint with pass_max %s', async (pass_max) => {
    const mockProducts = [
      { id: 'prod_03', title: 'Thingamajig', updated_at: '2026-02-01T00:00:00Z' },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ products: mockProducts, count: 51 }), { status: 200 }),
    );

    const checkpoint = { offset: 50, updated_at: '2026-01-15T00:00:00Z', pass_max };
    const result = await medusaProductReplication.pull.handler(checkpoint, 100, context);

    const calledUrl = (globalThis.fetch as any).mock.calls[0][0];
    expect(calledUrl).toContain('offset=50');
    expect(calledUrl).toContain('updated_at%5Bgte%5D=2026-01-15T00%3A00%3A00Z');

    // Finish at count; a legacy pass must not advance past its known lower bound.
    expect(result.checkpoint).toEqual({ offset: 0, updated_at: checkpoint.updated_at });
  });

  it.each([25, 50])('ends a full page only when it reaches count %i', async (count) => {
    const mockProducts = Array.from({ length: 25 }, (_, i) => ({
      id: `prod_${i}`,
      title: `Product ${i}`,
      updated_at: '2026-01-01T00:00:00Z',
    }));

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ products: [mockProducts[0]] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ products: mockProducts, count }), { status: 200 }));

    const result = await medusaProductReplication.pull.handler(undefined, 25, context);

    expect(result.checkpoint).toEqual(count === 25
      ? { offset: 0, updated_at: '2026-01-01T00:00:00Z' }
      : { offset: 25, updated_at: '', pass_mark: '2026-01-01T00:00:00Z', pass_count: count });
  });

  it('pages in id order, since many products share an updated_at', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ products: [], count: 0 }), { status: 200 }),
    );
    await medusaProductReplication.pull.handler(undefined, 10, context);
    expect(String(fetchSpy.mock.calls[1][0])).toContain('order=id');
  });

  it('keeps the updated_at filter while paging through a full pass', async () => {
    const page = (from: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: `prod_${from + i}`,
        updated_at: `2026-01-01T00:00:${String(from + i).padStart(2, '0')}Z`,
      }));
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ products: page(13, 1) })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ products: page(0, 10), count: 14 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ products: page(10, 4), count: 14 }), { status: 200 }));

    const first = await medusaProductReplication.pull.handler(undefined, 10, context);
    const second = await medusaProductReplication.pull.handler(first.checkpoint, 10, context);

    const secondUrl = String(fetchSpy.mock.calls[2][0]);
    expect(secondUrl).toContain('offset=10');
    expect(secondUrl).not.toContain('updated_at%5Bgte%5D');
    // End of pass: advance to the start mark and restart the offset.
    expect(second.checkpoint).toEqual({ offset: 0, updated_at: '2026-01-01T00:00:13Z' });
  });

  it.each([0, 50])('throws on non-OK response at offset %i', async (offset) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );

    await expect(
      medusaProductReplication.pull.handler({ offset, updated_at: '' }, 100, context),
    ).rejects.toThrow('Medusa API error: 500');
  });

  it.each([0, 50])('includes Medusa error messages at offset %i', async (offset) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Access denied' }), { status: 403 }),
    );
    await expect(medusaProductReplication.pull.handler({ offset, updated_at: '' }, 100, context))
      .rejects.toThrow('Medusa API error: 403: Access denied');
  });

  it('returns lastCheckpoint when no products are returned', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ products: [] }), { status: 200 }),
    );

    const checkpoint = { offset: 0, updated_at: '2026-01-01T00:00:00Z' };
    const result = await medusaProductReplication.pull.handler(checkpoint, 100, context);

    expect(result.checkpoint).toEqual(checkpoint);
  });

  it('returns an unchanged checkpoint without paging when the mark is unchanged', async () => {
    const checkpoint = { offset: 0, updated_at: '2026-01-01T00:00:00Z' };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ products: [{ id: 'prod_01', updated_at: checkpoint.updated_at }] })),
    );
    const result = await medusaProductReplication.pull.handler(checkpoint, 100, context);
    expect(result).toEqual({ documents: [], checkpoint });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('restarts an empty mid-pass page with the same bound and mark and a new count', async () => {
    const checkpoint = { offset: 2, updated_at: '2026-01-01T00:00:00Z', pass_mark: '2026-02-01T00:00:00Z', pass_count: 4 };
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ products: [], count: 4 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ products: [{ id: 'prod_01' }, { id: 'prod_02' }], count: 3 })));
    const result = await medusaProductReplication.pull.handler(checkpoint, 2, context);
    expect(result.documents).toHaveLength(2);
    expect(result.checkpoint).toEqual({ ...checkpoint, pass_count: 3 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const restarted = new URL(String(fetchSpy.mock.calls[1][0])).searchParams;
    expect(restarted.get('offset')).toBe('0');
    expect(restarted.get('updated_at[gte]')).toBe(checkpoint.updated_at);
  });
});

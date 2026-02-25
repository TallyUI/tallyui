import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SyncContext } from '@tallyui/core';

import { vendureProductReplication } from './products';

const context: SyncContext = {
  connectorId: 'vendure',
  baseUrl: 'https://my-vendure-server.com',
  headers: { Authorization: 'Bearer test_token' },
};

/**
 * Helper to build a mock GraphQL response.
 */
function gqlResponse(data: any, errors?: any[]) {
  return new Response(
    JSON.stringify({ data, errors }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('vendureProductReplication.pull.handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches products from initial checkpoint (undefined)', async () => {
    const mockProducts = [
      { id: '1', name: 'Widget', updatedAt: '2026-01-01T00:00:00Z' },
      { id: '2', name: 'Gadget', updatedAt: '2026-01-02T00:00:00Z' },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      gqlResponse({
        products: { items: mockProducts, totalItems: 2 },
      }),
    );

    const result = await vendureProductReplication.pull.handler(undefined, 100, context);

    expect(result.documents).toHaveLength(2);
    expect(result.documents[0]._deleted).toBe(false);
    expect(result.checkpoint).toEqual({
      skip: 0,
      updatedAt: '2026-01-02T00:00:00Z',
    });

    // Verify the GraphQL request
    const [url, opts] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toContain('/admin-api');
    const body = JSON.parse(opts.body);
    expect(body.variables.options.take).toBe(100);
    expect(body.variables.options.skip).toBe(0);
    expect(body.variables.options.filter).toBeUndefined();
  });

  it('passes updatedAt filter and skip from checkpoint', async () => {
    const mockProducts = [
      { id: '3', name: 'Thingamajig', updatedAt: '2026-02-01T00:00:00Z' },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      gqlResponse({
        products: { items: mockProducts, totalItems: 1 },
      }),
    );

    const checkpoint = { skip: 50, updatedAt: '2026-01-15T00:00:00Z' };
    const result = await vendureProductReplication.pull.handler(checkpoint, 100, context);

    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(body.variables.options.skip).toBe(50);
    expect(body.variables.options.filter).toEqual({
      updatedAt: { after: '2026-01-15T00:00:00Z' },
    });

    // Batch smaller than batchSize resets skip to 0
    expect(result.checkpoint.skip).toBe(0);
  });

  it('advances skip when batch equals batchSize', async () => {
    const mockProducts = Array.from({ length: 25 }, (_, i) => ({
      id: String(i),
      name: `Product ${i}`,
      updatedAt: '2026-01-01T00:00:00Z',
    }));

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      gqlResponse({
        products: { items: mockProducts, totalItems: 100 },
      }),
    );

    const result = await vendureProductReplication.pull.handler(undefined, 25, context);

    expect(result.checkpoint.skip).toBe(25);
  });

  it('throws on non-OK HTTP response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );

    await expect(
      vendureProductReplication.pull.handler(undefined, 100, context),
    ).rejects.toThrow('Vendure API error: 500');
  });

  it('throws on GraphQL errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      gqlResponse(null, [{ message: 'Something went wrong' }]),
    );

    await expect(
      vendureProductReplication.pull.handler(undefined, 100, context),
    ).rejects.toThrow('Vendure GraphQL error: Something went wrong');
  });

  it('returns lastCheckpoint when no products are returned', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      gqlResponse({
        products: { items: [], totalItems: 0 },
      }),
    );

    const checkpoint = { skip: 0, updatedAt: '2026-01-01T00:00:00Z' };
    const result = await vendureProductReplication.pull.handler(checkpoint, 100, context);

    expect(result.checkpoint).toEqual(checkpoint);
  });
});

describe('vendureProductReplication.push.handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends updateProduct mutation', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      gqlResponse({
        updateProduct: { id: '1', updatedAt: '2026-01-03T00:00:00Z' },
      }),
    );

    const conflicts = await vendureProductReplication.push!.handler(
      [{
        newDocumentState: { id: '1', name: 'Updated', _deleted: false } as any,
        assumedMasterState: { id: '1', name: 'Old', _deleted: false } as any,
      }],
      context,
    );

    expect(conflicts).toHaveLength(0);
    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(body.query).toContain('updateProduct');
    expect(body.variables.input.name).toBe('Updated');
  });

  it('returns conflicts on GraphQL error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      gqlResponse(null, [{ message: 'Conflict' }]),
    );

    const conflicts = await vendureProductReplication.push!.handler(
      [{
        newDocumentState: { id: '1', name: 'Updated', _deleted: false } as any,
        assumedMasterState: { id: '1', name: 'Server Version', _deleted: false } as any,
      }],
      context,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].name).toBe('Server Version');
  });

  it('returns conflicts on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const conflicts = await vendureProductReplication.push!.handler(
      [{
        newDocumentState: { id: '1', name: 'Updated', _deleted: false } as any,
        assumedMasterState: { id: '1', name: 'Server Version', _deleted: false } as any,
      }],
      context,
    );

    expect(conflicts).toHaveLength(1);
  });

  it('does not return conflict when assumedMasterState is absent', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      gqlResponse(null, [{ message: 'Error' }]),
    );

    const conflicts = await vendureProductReplication.push!.handler(
      [{
        newDocumentState: { id: '1', name: 'New Product', _deleted: false } as any,
      }],
      context,
    );

    expect(conflicts).toHaveLength(0);
  });
});

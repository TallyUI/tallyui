import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SyncContext } from '@tallyui/core';

import { wooProductReplication } from './products';

const context: SyncContext = {
  connectorId: 'woocommerce',
  baseUrl: 'https://example.com/wp-json/wc/v3',
  headers: { Authorization: 'Basic dGVzdDp0ZXN0' },
};

describe('wooProductReplication.pull.handler', () => {
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

describe('wooProductReplication.push.handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends PUT for updates', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const conflicts = await wooProductReplication.push!.handler(
      [{
        newDocumentState: { id: '1', name: 'Updated', _deleted: false } as any,
        assumedMasterState: { id: '1', name: 'Old', _deleted: false } as any,
      }],
      context,
    );

    expect(conflicts).toHaveLength(0);
    const [url, opts] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toContain('/products/1');
    expect(opts.method).toBe('PUT');
  });

  it('sends POST for creates', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    const conflicts = await wooProductReplication.push!.handler(
      [{
        newDocumentState: { id: '1', name: 'New Product', _deleted: false } as any,
        // No assumedMasterState = create
      }],
      context,
    );

    expect(conflicts).toHaveLength(0);
    const [, opts] = (globalThis.fetch as any).mock.calls[0];
    expect(opts.method).toBe('POST');
  });

  it('returns conflicts on server error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('conflict', { status: 409 }),
    );

    const conflicts = await wooProductReplication.push!.handler(
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

    const conflicts = await wooProductReplication.push!.handler(
      [{
        newDocumentState: { id: '1', name: 'Updated', _deleted: false } as any,
        assumedMasterState: { id: '1', name: 'Server Version', _deleted: false } as any,
      }],
      context,
    );

    expect(conflicts).toHaveLength(1);
  });

  it('does not return conflict for creates that fail', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('error', { status: 500 }),
    );

    const conflicts = await wooProductReplication.push!.handler(
      [{
        newDocumentState: { id: '1', name: 'New Product', _deleted: false } as any,
        // No assumedMasterState = create, so no conflict to report
      }],
      context,
    );

    // Creates without assumedMasterState don't produce conflicts
    expect(conflicts).toHaveLength(0);
  });
});

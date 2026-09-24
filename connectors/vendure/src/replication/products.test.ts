import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SyncContext } from '@tallyui/core';

import { vendureProductReplication, type VendureProductCheckpoint } from './products';
import { createVendureConnector } from '../index';

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
  it('is pull-only: products are server-owned', () => {
    expect(vendureProductReplication.push).toBeUndefined();
  });

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
      updatedAt: { after: '2026-01-14T23:59:59.999Z' },
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

// Simulate Vendure's strict timestamp filter, followed by sorting and offset paging.
function serveProducts(products: { id: string; updatedAt: string }[]) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const { options } = JSON.parse(init!.body as string).variables;
    expect(options.take).toBeLessThanOrEqual(1000);
    expect(options.sort).toEqual({ id: 'ASC' });
    const after = options.filter?.updatedAt?.after;
    const items = products.filter((p) => !after || Date.parse(p.updatedAt) > Date.parse(after))
      .sort((a, b) => a.id.localeCompare(b.id));
    return gqlResponse({ products: {
      items: items.slice(options.skip, options.skip + options.take), totalItems: items.length,
    } });
  });
}

describe('fixed-window passes', () => {
  beforeEach(() => vi.restoreAllMocks());
  const timestamp = '2026-01-01T00:00:00.000Z';

  it('delivers all five tied ids across pages and replays boundary ties next pass', async () => {
    serveProducts(['5', '3', '1', '4', '2'].map((id) => ({ id, updatedAt: timestamp })));
    let checkpoint: VendureProductCheckpoint | undefined;
    const ids: string[] = [];
    for (let page = 0; page < 3; page++) {
      const result = await vendureProductReplication.pull.handler(checkpoint, 2, context);
      ids.push(...result.documents.map((p) => p.id));
      checkpoint = result.checkpoint;
    }
    expect(ids).toEqual(['1', '2', '3', '4', '5']);
    expect(checkpoint).toEqual({ skip: 0, updatedAt: timestamp });
    const next = await vendureProductReplication.pull.handler(checkpoint, 2, context);
    expect(next.documents.map((p) => p.id)).toEqual(['1', '2']);
  });

  it('keeps the window fixed through moving writes and an empty terminal page', async () => {
    const newer = '2026-02-01T00:00:00.000Z';
    const products = ['4', '2', '1', '3'].map((id) => ({ id, updatedAt: timestamp }));
    serveProducts(products);
    const first = await vendureProductReplication.pull.handler({ skip: 0, updatedAt: timestamp }, 2, context);
    products.find((p) => p.id === '1')!.updatedAt = newer;
    products.find((p) => p.id === '3')!.updatedAt = newer;
    const second = await vendureProductReplication.pull.handler(first.checkpoint, 2, context);
    expect([...first.documents, ...second.documents].map((p) => p.id)).toEqual(['1', '2', '3', '4']);
    expect(second.checkpoint).toEqual({ skip: 4, updatedAt: timestamp, passMax: newer });
    const end = await vendureProductReplication.pull.handler(second.checkpoint, 2, context);
    expect(end.documents).toEqual([]);
    expect(end.checkpoint).toEqual({ skip: 0, updatedAt: newer });
    const next = await vendureProductReplication.pull.handler(end.checkpoint, 2, context);
    expect(next.documents.map((p) => [p.id, p.updatedAt])).toEqual([['1', newer], ['3', newer]]);
  });

  it('allows 1000 rows and rejects larger batches before making a request', async () => {
    const fetch = serveProducts([]);
    await vendureProductReplication.pull.handler(undefined, 1000, context);
    await expect(vendureProductReplication.pull.handler(undefined, 1001, context)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, 'barcode', 'ean'])('selects only the opted-in barcode field: %s', async (barcodeField) => {
    const connector = createVendureConnector({ barcodeField });
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => gqlResponse({ products: { items: [] } }));
    await connector.replication!.products!.pull.handler(undefined, 2, context);
    await connector.sync.products.fetchByIds(['1'], context);
    for (const [, init] of fetch.mock.calls) {
      const { query } = JSON.parse(init!.body as string);
      if (barcodeField) expect(query).toContain(`customFields { ${barcodeField} }`);
      else expect(query).not.toContain('customFields');
      expect(query).toContain('stockLevels { stockLocationId stockOnHand stockAllocated }');
    }
    const doc = { variants: [{ customFields: { barcode: '123', ean: '456' } }] };
    expect(connector.traits.product.getBarcode(doc)).toBe(barcodeField === 'ean' ? '456' : barcodeField ? '123' : undefined);
  });
});

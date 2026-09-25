import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SyncContext } from '@tallyui/core';

import { createVendureProductReplication, vendureProductReplication, toProductDocument, probeUpdatedAtSkew, type VendureProductCheckpoint } from './products';
import { createVendureConnector } from '../index';
import { vendureProductTraits } from '../traits/product';

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

    serveProducts(mockProducts);

    const result = await vendureProductReplication.pull.handler(undefined, 100, context);

    expect(result.documents).toHaveLength(2);
    expect(result.documents[0]._deleted).toBe(false);
    expect(result.checkpoint).toEqual({
      skip: 0,
      updatedAt: '2026-01-02T00:00:00Z',
    });

    // Verify the GraphQL request
    const [url, opts] = (globalThis.fetch as any).mock.calls[3];
    expect(url).toContain('/admin-api');
    const body = JSON.parse(opts.body);
    expect(body.variables.options.take).toBe(100);
    expect(body.variables.options.skip).toBe(0);
    expect(body.variables.options.filter).toBeUndefined();
  });

  it('passes updatedAt filter and skip from a mid-pass checkpoint', async () => {
    const mockProducts = [
      { id: '3', name: 'Thingamajig', updatedAt: '2026-02-01T00:00:00Z' },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      gqlResponse({
        products: { items: mockProducts, totalItems: 1 },
      }),
    );

    // A current-shape mid-pass checkpoint (passHighWater/passTotal set): skip
    // and filter pass straight through, with no mark or probe request.
    const checkpoint = {
      skip: 50, updatedAt: '2026-01-15T00:00:00Z',
      passHighWater: '2026-02-01T00:00:00Z', passTotal: 1,
    };
    const result = await vendureProductReplication.pull.handler(checkpoint, 100, context);

    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(body.variables.options.skip).toBe(50);
    expect(body.variables.options.filter).toEqual({
      updatedAt: { after: '2026-01-14T23:59:59.999Z' },
    });

    // Reaching totalItems resets skip to 0
    expect(result.checkpoint.skip).toBe(0);
  });

  it('advances skip while more totalItems remain', async () => {
    const mockProducts = Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      name: `Product ${i}`,
      updatedAt: '2026-01-01T00:00:00Z',
    }));

    serveProducts(mockProducts);

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

  it('includes GraphQL errors on non-OK HTTP responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
      JSON.stringify({ errors: [{ message: 'Unknown custom field' }] }), { status: 400 },
    ));
    await expect(vendureProductReplication.pull.handler(undefined, 100, context))
      .rejects.toThrow('Vendure API error: 400: Unknown custom field');
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

  it('delivers variants in ascending id order from a shuffled server response', async () => {
    const shuffled = [{ id: '10' }, { id: '2' }, { id: '9' }];
    const mockProducts = [{ id: '1', updatedAt: '2026-01-01T00:00:00Z', variants: shuffled }];

    serveProducts(mockProducts as any);

    const result = await vendureProductReplication.pull.handler(undefined, 100, context);

    expect((result.documents[0].variants as any[]).map((v) => v.id)).toEqual(['2', '9', '10']);
  });
});

// Simulate Vendure's strict timestamp filter, followed by sorting and offset paging.
function serveProducts(products: { id: string; updatedAt: string }[]) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const { options } = JSON.parse(init!.body as string).variables;
    expect(options.take).toBeLessThanOrEqual(1000);
    expect(options.sort).toEqual(options.take === 1 ? { updatedAt: 'DESC' } : { id: 'ASC' });
    const after = options.filter?.updatedAt?.after;
    const items = products.filter((p) => !after || Date.parse(p.updatedAt) > Date.parse(after))
      .sort(options.sort.updatedAt === 'DESC'
        ? (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
        : (a, b) => Number(a.id) - Number(b.id));
    return gqlResponse({ products: {
      items: items.slice(options.skip ?? 0, (options.skip ?? 0) + options.take), totalItems: items.length,
    } });
  });
}

describe('fixed-window passes', () => {
  beforeEach(() => vi.restoreAllMocks());
  const timestamp = '2026-01-01T00:00:00.000Z';

  it('widens the negative probe and page filters, including after an empty-page restart', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetch = serveProducts([{ id: '1', updatedAt: timestamp }]);
    fetch.mockResolvedValueOnce(gqlResponse({ products: { items: [], totalItems: 0 } }));
    const adapter = createVendureProductReplication(undefined, 2 * 3600e3);
    // A current-shape mid-pass checkpoint, so this exercises the empty-page
    // restart below, not the old-shape normalisation (backlog 30).
    const result = await adapter.pull.handler({
      skip: 50, updatedAt: '2025-12-31T00:00:00.000Z',
      passHighWater: '2025-12-31T00:00:00.000Z', passTotal: 0,
    }, 2, context);
    const options = fetch.mock.calls.map(([, init]) => JSON.parse(init!.body as string).variables.options);
    expect(options.map((option) => option.filter?.updatedAt.after)).toEqual([
      '2025-12-30T21:59:59.999Z', undefined,
      '2025-12-31T21:59:59.999Z', '2025-12-30T21:59:59.999Z',
    ]);
    expect(options[2].take).toBe(1);
    expect(result.documents.map((product) => product.id)).toEqual(['1']);
    expect(result.checkpoint).toEqual({ skip: 0, updatedAt: timestamp });
    expect(warn).not.toHaveBeenCalled();
  });

  it('delivers all five tied ids and stops with one high-water read when unchanged', async () => {
    const products = ['5', '3', '1', '4', '2'].map((id) => ({ id, updatedAt: timestamp }));
    const fetch = serveProducts(products);
    let checkpoint: VendureProductCheckpoint | undefined;
    const ids: string[] = [];
    for (let page = 0; page < 3; page++) {
      const result = await vendureProductReplication.pull.handler(checkpoint, 2, context);
      ids.push(...result.documents.map((p) => p.id));
      checkpoint = result.checkpoint;
    }
    expect(ids).toEqual(['1', '2', '3', '4', '5']);
    expect(checkpoint).toEqual({ skip: 0, updatedAt: timestamp });
    fetch.mockClear();
    const idle = await vendureProductReplication.pull.handler(checkpoint, 2, context);
    expect(idle).toEqual({ documents: [], checkpoint });
    expect(fetch).toHaveBeenCalledTimes(1);
    products[0].updatedAt = '2026-02-01T00:00:00.000Z';
    const next = await vendureProductReplication.pull.handler(checkpoint, 2, context);
    expect(next.documents.map((p) => p.id)).toEqual(['1', '2']);
  });

  it('ends a full final page on totalItems and retains the pass-start high-water mark', async () => {
    const newer = '2026-02-01T00:00:00.000Z';
    const products = ['4', '2', '1', '3'].map((id) => ({ id, updatedAt: timestamp }));
    serveProducts(products);
    const first = await vendureProductReplication.pull.handler(undefined, 2, context);
    products.find((p) => p.id === '1')!.updatedAt = newer;
    products.find((p) => p.id === '3')!.updatedAt = newer;
    const second = await vendureProductReplication.pull.handler(first.checkpoint, 2, context);
    expect([...first.documents, ...second.documents].map((p) => p.id)).toEqual(['1', '2', '3', '4']);
    expect(second.checkpoint).toEqual({ skip: 0, updatedAt: timestamp });
    const next = await vendureProductReplication.pull.handler(second.checkpoint, 2, context);
    expect(next.documents.map((p) => [p.id, p.updatedAt])).toEqual([['1', newer], ['2', timestamp]]);
    expect(next.checkpoint).toEqual({ skip: 2, updatedAt: timestamp, passHighWater: newer, passTotal: 4 });
  });

  it('allows 1000 rows and rejects larger batches before making a request', async () => {
    const fetch = serveProducts([]);
    await vendureProductReplication.pull.handler(undefined, 1000, context);
    await expect(vendureProductReplication.pull.handler(undefined, 1001, context)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('restarts at skip zero when totalItems drops from 2500 to 1900', async () => {
    const lowerBound = '2025-12-31T00:00:00.000Z';
    const products = Array.from({ length: 2500 }, (_, i) => ({ id: String(i + 1), updatedAt: timestamp }));
    const fetch = serveProducts(products);
    const first = await vendureProductReplication.pull.handler({ skip: 0, updatedAt: lowerBound }, 1000, context);
    expect(first.checkpoint).toEqual({ skip: 1000, updatedAt: lowerBound, passHighWater: timestamp, passTotal: 2500 });
    products.splice(0, 600);
    products[0].updatedAt = '2026-02-01T00:00:00.000Z';
    fetch.mockClear();

    const second = await vendureProductReplication.pull.handler(first.checkpoint, 1000, context);

    expect(fetch.mock.calls.map(([, init]) => JSON.parse(init!.body as string).variables.options)).toEqual([
      { take: 1000, skip: 1000, sort: { id: 'ASC' }, filter: { updatedAt: { after: '2025-12-30T23:59:59.999Z' } } },
      { take: 1000, skip: 0, sort: { id: 'ASC' }, filter: { updatedAt: { after: '2025-12-30T23:59:59.999Z' } } },
    ]);
    expect(second.documents.map((p) => p.id)).toEqual(products.slice(0, 1000).map((p) => p.id));
    expect(second.checkpoint).toEqual({ skip: 1000, updatedAt: lowerBound, passHighWater: timestamp, passTotal: 1900 });
  });

  it('gives the mark and both skew probes their own minimal query (backlog 29)', async () => {
    const fetch = serveProducts([{ id: '1', updatedAt: timestamp }]);
    await vendureProductReplication.pull.handler(undefined, 10, context);

    const queries = fetch.mock.calls.map(([, init]) => JSON.parse(init!.body as string).query as string);
    expect(queries).toHaveLength(4); // mark, the two skew probes, then the page.
    for (const query of queries.slice(0, 3)) {
      expect(query).toContain('items { id updatedAt }');
      expect(query).not.toContain('variants');
    }
    expect(queries[3]).toContain('variants {'); // the page query is unchanged.
  });

  it('restarts once from an old-shape (pre-#45) mid-pass checkpoint, then syncs normally (backlog 30)', async () => {
    const products = [
      { id: '1', updatedAt: timestamp }, { id: '2', updatedAt: timestamp }, { id: '3', updatedAt: timestamp },
    ];
    const fetch = serveProducts(products);
    // The shape saved mid-pass before #45 added passHighWater/passTotal:
    // skip and updatedAt only.
    const oldShape: VendureProductCheckpoint = { skip: 1, updatedAt: '2025-12-31T00:00:00.000Z' };

    const first = await vendureProductReplication.pull.handler(oldShape, 10, context);
    const firstSyncRequests = fetch.mock.calls.length;
    expect(first.documents.map((p) => p.id)).toEqual(['1', '2', '3']);
    expect(first.checkpoint).toEqual({ skip: 0, updatedAt: timestamp });

    fetch.mockClear();
    const second = await vendureProductReplication.pull.handler(first.checkpoint, 10, context);
    const secondSyncRequests = fetch.mock.calls.length;
    expect(second).toEqual({ documents: [], checkpoint: first.checkpoint });

    fetch.mockClear();
    const third = await vendureProductReplication.pull.handler(second.checkpoint, 10, context);
    const thirdSyncRequests = fetch.mock.calls.length;
    expect(third).toEqual({ documents: [], checkpoint: second.checkpoint });

    // The first sync restarts the pass (mark + two probes + the page).
    expect(firstSyncRequests).toBe(4);
    // Each sync after makes at most one more request than a normal idle sync (1).
    expect(secondSyncRequests).toBeLessThanOrEqual(2);
    expect(thirdSyncRequests).toBeLessThanOrEqual(2);
  });

  it.each([undefined, 'barcode', 'ean'])('selects only the opted-in barcode field: %s', async (barcodeField) => {
    const connector = createVendureConnector({ barcodeField });
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => gqlResponse({ products: { items: [] } }));
    await createVendureProductReplication(barcodeField).pull.handler(undefined, 2, context);
    await connector.sync.products.fetchByIds(['1'], context);
    for (const [, init] of fetch.mock.calls) {
      const { query } = JSON.parse(init!.body as string);
      if (query.includes('GetProductsMark')) continue; // backlog 29: the mark query is minimal, not opted in.
      if (barcodeField) expect(query).toContain(`customFields { ${barcodeField} }`);
      else expect(query).not.toContain('customFields');
      expect(query).toContain('stockLevels { stockLocationId stockOnHand stockAllocated }');
    }
    const doc = { variants: [{ customFields: { barcode: '123', ean: '456' } }] };
    expect(connector.traits.product.getBarcode(doc)).toBe(barcodeField === 'ean' ? '456' : barcodeField ? '123' : undefined);
  });
});

describe('probeUpdatedAtSkew (backlog 31)', () => {
  it('throws once when the mark is deleted, then a retried call (RxDB retry) passes cleanly', async () => {
    await expect(probeUpdatedAtSkew('2026-01-01T00:00:00.000Z', 0, async () => 0)).rejects.toThrow(/TZ=UTC.*updatedAtSkewMs/);
    let calls = 0;
    await expect(probeUpdatedAtSkew('2026-01-01T00:00:00.000Z', 0, async () => (calls++ === 0 ? 1 : 0)))
      .resolves.toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('the guard re-reads the mark once before throwing (backlog 31, optional part)', () => {
  beforeEach(() => vi.restoreAllMocks());
  const mark1 = '2026-01-01T00:10:00.000Z';
  const mark2 = '2026-01-01T00:05:00.000Z';

  it('a deletion between the mark and the probe gives a clean pass with no error', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(gqlResponse({ products: { items: [{ id: '9', updatedAt: mark1 }], totalItems: 1 } })) // mark read: '9' looks newest...
      .mockResolvedValueOnce(gqlResponse({ products: { items: [], totalItems: 0 } })) // ...but it's gone by the time the probe runs.
      .mockResolvedValueOnce(gqlResponse({ products: { items: [{ id: '5', updatedAt: mark2 }], totalItems: 1 } })) // re-read: '5' is now the newest.
      .mockResolvedValueOnce(gqlResponse({ products: { items: [{ id: '5', updatedAt: mark2 }], totalItems: 1 } })) // the retried probe, against the new mark, succeeds.
      .mockResolvedValueOnce(gqlResponse({ products: { items: [], totalItems: 0 } })) // the negative-overlap probe: no over-fetch.
      .mockResolvedValueOnce(gqlResponse({ products: { items: [{ id: '5', updatedAt: mark2 }], totalItems: 1 } })); // the page.

    const result = await vendureProductReplication.pull.handler(undefined, 10, context);

    expect(result.documents.map((p) => p.id)).toEqual(['5']);
    expect(result.checkpoint).toEqual({ skip: 0, updatedAt: mark2 });
  });

  it('a persistent mismatch still throws, as today', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(gqlResponse({ products: { items: [{ id: '9', updatedAt: mark1 }], totalItems: 1 } })) // mark read
      .mockResolvedValueOnce(gqlResponse({ products: { items: [], totalItems: 0 } })) // the probe: empty
      .mockResolvedValueOnce(gqlResponse({ products: { items: [], totalItems: 0 } })); // the re-read: nothing survives either

    await expect(vendureProductReplication.pull.handler(undefined, 10, context))
      .rejects.toThrow(/TZ=UTC.*updatedAtSkewMs/);
  });
});

describe('toProductDocument variant order', () => {
  const shuffled = [
    { id: '10', price: 30, currencyCode: 'EUR' },
    { id: '2', price: 10, currencyCode: 'EUR' },
    { id: '9', price: 20, currencyCode: 'EUR' },
  ];

  it('sorts numeric-id variants by id without mutating the input', () => {
    const input = [...shuffled];
    const doc = toProductDocument({ id: '1', variants: input });
    expect((doc.variants as any[]).map((v) => v.id)).toEqual(['2', '9', '10']);
    expect(input).toEqual(shuffled);
  });

  it('gives getPrices the same result regardless of arrival order', () => {
    const forward = toProductDocument({ id: '1', variants: shuffled });
    const reversed = toProductDocument({ id: '1', variants: [...shuffled].reverse() });
    expect(vendureProductTraits.getPrices(forward)).toEqual(vendureProductTraits.getPrices(reversed));
    expect(vendureProductTraits.getPrices(forward)).toEqual([{ amount: 10, currency: 'EUR', kind: 'base' }]);
  });
});

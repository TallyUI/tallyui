import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SyncContext } from '@tallyui/core';

import { woocommerceConnector, WooMissingUuidError } from '../index';
import { wooProductSync } from '../sync/products';
import { wooProductReplication, type WooProductCheckpoint } from './products';

const context: SyncContext = {
  connectorId: 'woocommerce',
  baseUrl: 'https://example.com/wp-json/wcpos/v2',
  headers: woocommerceConnector.auth.getHeaders({ token: 't' }),
};

function mockProductsEndpoint(products: any[], { total = true } = {}) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const params = new URL(String(input)).searchParams;
    const after = params.get('modified_after');
    const window = products.filter((p) => !after || params.get('dates_are_gmt') !== 'true' || p.date_modified_gmt > after);
    window.sort((a, b) => {
      const comparison = params.get('orderby') === 'id' ? a.id - b.id : a.date_modified_gmt.localeCompare(b.date_modified_gmt);
      return params.get('order') === 'desc' ? -comparison : comparison;
    });
    const offset = Number(params.get('offset') ?? 0);
    return new Response(JSON.stringify(window.slice(offset, offset + Number(params.get('per_page')))), {
      headers: total ? { 'X-WP-Total': String(window.length) } : {},
    });
  });
}

async function pullRun(checkpoint: WooProductCheckpoint | undefined, batchSize: number, onPage = (_checkpoint: WooProductCheckpoint) => {}) {
  const documents: any[] = [];
  for (let calls = 0; calls < 20; calls++) {
    const result = await wooProductReplication.pull.handler(checkpoint, batchSize, context);
    documents.push(...result.documents);
    checkpoint = { ...checkpoint, ...result.checkpoint };
    onPage(checkpoint);
    if (result.documents.length < batchSize) return { documents, checkpoint };
  }
  throw new Error('Pull loop did not stop');
}

describe('wooProductReplication.pull.handler', () => {
  it('is pull-only: products are server-owned', () => {
    expect(wooProductReplication.push).toBeUndefined();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches products from initial checkpoint (undefined)', async () => {
    const mockProducts = [
      { id: 1, uuid: 'abc', name: 'Widget', status: 'publish', date_modified_gmt: '2026-01-01T00:00:00' },
      { id: 2, uuid: 'def', name: 'Gadget', status: 'publish', date_modified_gmt: '2026-01-02T00:00:00' },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify([mockProducts[1]]))).mockResolvedValueOnce(
      new Response(JSON.stringify(mockProducts), { status: 200 }),
    );

    const result = await wooProductReplication.pull.handler(undefined, 100, context);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://example.com/wp-json/wcpos/v2/products?per_page=100&offset=0&orderby=id&order=asc',
      expect.objectContaining({
        headers: { ...context.headers, 'Content-Type': 'application/json' },
      }),
    );
    expect(result.documents).toHaveLength(2);
    expect(result.documents[0]._deleted).toBe(false);
    expect(result.checkpoint).toEqual({
      modified: '2026-01-02T00:00:00',
      offset: 0, pass_mark: undefined, pass_count: undefined,
    });
  });

  it('marks draft, pending and private products as deleted', async () => {
    const products = ['draft', 'pending', 'private', undefined].map((status, id) => ({
      id, uuid: `uuid-${id}`, status, date_modified_gmt: '2026-01-01T00:00:00',
    }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify([products[0]]))).mockResolvedValueOnce(
      new Response(JSON.stringify(products), { status: 200 }),
    );

    const result = await wooProductReplication.pull.handler(undefined, 100, context);

    expect(result.documents).toEqual(products.map((p) => ({ ...p, _deleted: true })));
  });

  it('keeps published products', async () => {
    const product = { id: 1, uuid: 'abc', status: 'publish', date_modified_gmt: '2026-01-01T00:00:00' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify([product]))).mockResolvedValueOnce(
      new Response(JSON.stringify([product]), { status: 200 }),
    );

    const result = await wooProductReplication.pull.handler(undefined, 100, context);

    expect(result.documents).toEqual([{ ...product, _deleted: false }]);
  });

  it('advances the checkpoint past an unpublished product', async () => {
    const products = [
      { id: 1, uuid: 'abc', status: 'publish', date_modified_gmt: '2026-01-02T00:00:00' },
      { id: 2, uuid: 'def', status: 'draft', date_modified_gmt: '2026-01-03T00:00:00' },
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify([products[1]]))).mockResolvedValueOnce(
      new Response(JSON.stringify(products), { status: 200 }),
    );

    const result = await wooProductReplication.pull.handler({ offset: 0, modified: '2026-01-01T00:00:00' }, 100, context);

    expect(result.documents).toEqual([{ ...products[0], _deleted: false }, { ...products[1], _deleted: true }]);
    expect(result.checkpoint).toEqual({ modified: '2026-01-03T00:00:00', offset: 0, pass_mark: undefined, pass_count: undefined });
  });

  it.each([undefined, { offset: 0, modified: '2026-01-01T00:00:00', pass_mark: '2026-01-02T00:00:00' }])('sends no status parameter', async (checkpoint) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify([]), { status: 200 }),
    );

    await wooProductReplication.pull.handler(checkpoint, 100, context);

    for (const [url] of fetchSpy.mock.calls) expect(new URL(String(url)).searchParams.has('status')).toBe(false);
  });

  it('fetches products after a checkpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    const checkpoint = { offset: 0, modified: '2026-01-01T00:00:00', pass_mark: '2026-01-02T00:00:00' };
    const result = await wooProductReplication.pull.handler(checkpoint, 100, context);

    expect(result.documents).toHaveLength(0);

    const calledUrl = (globalThis.fetch as any).mock.calls[0][0];
    expect(calledUrl).toContain('modified_after=2025-12-31T23%3A59%3A59');
    expect(calledUrl).toContain('orderby=id');
    expect(calledUrl).toContain('order=asc');
  });

  it('sends dates_are_gmt=true with modified_after', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    const checkpoint = { offset: 0, modified: '2026-01-01T00:00:00', pass_mark: '2026-01-02T00:00:00' };

    await wooProductReplication.pull.handler(checkpoint, 100, context);

    const params = new URL(String(fetchSpy.mock.calls[0][0])).searchParams;
    expect(params.get('modified_after')).toBe('2025-12-31T23:59:59');
    expect(params.get('dates_are_gmt')).toBe('true');
  });

  it('sends neither modified_after nor dates_are_gmt on the first pull', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('[]')).mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    await wooProductReplication.pull.handler(undefined, 100, context);

    const params = new URL(String(fetchSpy.mock.calls[1][0])).searchParams;
    expect(params.has('modified_after')).toBe(false);
    expect(params.has('dates_are_gmt')).toBe(false);
  });

  it('sends a GMT modified_after query from the deprecated sync', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    const date = '2026-01-01T00:00:00';

    await wooProductSync.fetchModifiedAfter!(date, context);

    const params = new URL(String(fetchSpy.mock.calls[0][0])).searchParams;
    expect(params.get('modified_after')).toBe(date);
    expect(params.get('dates_are_gmt')).toBe('true');
    expect(params.get('per_page')).toBe('100');
  });

  it('uses batchSize as per_page', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('[]')).mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    await wooProductReplication.pull.handler(undefined, 25, context);

    const calledUrl = (globalThis.fetch as any).mock.calls[1][0];
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

    const checkpoint = { offset: 0, modified: '2026-01-01T00:00:00' };
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

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify([{ date_modified_gmt: '2026-03-03T00:00:00' }]))).mockResolvedValueOnce(
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

  it('a run of equal date_modified_gmt values across a page boundary is neither skipped nor duplicated', async () => {
    const products = Array.from({ length: 5 }, (_, id) => ({
      id: id + 1, uuid: `uuid-${id + 1}`, status: 'publish', date_modified_gmt: '2026-01-01T08:00:00',
    }));
    mockProductsEndpoint(products);

    const result = await pullRun(undefined, 2);

    expect(result.documents.map((p) => p.uuid)).toEqual(products.map((p) => p.uuid));
    expect(result.checkpoint).toEqual({ modified: '2026-01-01T08:00:00', offset: 0, pass_mark: undefined, pass_count: undefined });
  });

  it('a product modified during a pass is returned by the next pass', async () => {
    const products = Array.from({ length: 5 }, (_, id) => ({
      id: id + 1, uuid: `uuid-${id + 1}`, status: 'publish', date_modified_gmt: '2026-01-01T08:00:00',
    }));
    mockProductsEndpoint(products);
    const first = await pullRun(undefined, 2, () => {
      products[0].date_modified_gmt = '2026-01-01T08:00:01';
      products[0].status = 'draft';
    });
    expect(first.documents.map((p) => p.uuid)).toEqual(products.map((p) => p.uuid));
    expect(first.documents[0]._deleted).toBe(false);
    expect(first.checkpoint.modified).toBe('2026-01-01T08:00:00');

    const next = await pullRun(first.checkpoint, 2);

    expect(next.documents.map((p) => p.uuid)).toEqual(products.map((p) => p.uuid));
    expect(next.documents[0]).toEqual({ ...products[0], _deleted: true });
    expect(next.checkpoint.modified).toBe('2026-01-01T08:00:01');
    expect((await pullRun(next.checkpoint, 2)).documents).toEqual([]);
  });

  it('restarts the pass when X-WP-Total shrinks mid-pass', async () => {
    const checkpoint = { modified: '2026-01-01T08:00:00', offset: 2, pass_mark: '2026-01-02T08:00:00', pass_count: 5 };
    const products = [{ id: 1, uuid: 'one' }, { id: 2, uuid: 'two' }];
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 3, uuid: 'three' }, { id: 4, uuid: 'four' }]), { headers: { 'X-WP-Total': '4' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(products), { headers: { 'X-WP-Total': '4' } }));

    const result = await wooProductReplication.pull.handler(checkpoint, 2, context);

    expect(result.documents.map((p) => p.uuid)).toEqual(['one', 'two']);
    expect(result.checkpoint).toEqual({ ...checkpoint, pass_count: 4, restarts: 1 });
    expect(fetchSpy.mock.calls.map(([url]) => new URL(String(url)).searchParams.get('offset'))).toEqual(['2', '0']);
    expect(fetchSpy.mock.calls.map(([url]) => new URL(String(url)).searchParams.get('modified_after'))).toEqual(['2026-01-01T07:59:59', '2026-01-01T07:59:59']);
  });

  it('ends the pass without X-WP-Total when the window is an exact multiple of batchSize', async () => {
    const products = Array.from({ length: 4 }, (_, id) => ({
      id: id + 1, uuid: `uuid-${id + 1}`, status: 'publish', date_modified_gmt: `2026-01-0${id + 1}T08:00:00`,
    }));
    mockProductsEndpoint(products, { total: false });

    const result = await pullRun(undefined, 2);

    expect(result.documents.map((p) => p.uuid)).toEqual(products.map((p) => p.uuid));
    expect(result.checkpoint.modified).toBe('2026-01-04T08:00:00');
  });

  it('still restarts on an empty page at offset > 0 when X-WP-Total is present', async () => {
    const checkpoint = { modified: '2026-01-01T08:00:00', offset: 4, pass_mark: '2026-01-02T08:00:00', pass_count: 4 };
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('[]', { headers: { 'X-WP-Total': '4' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1, uuid: 'one' }, { id: 2, uuid: 'two' }]), { headers: { 'X-WP-Total': '4' } }));

    const result = await wooProductReplication.pull.handler(checkpoint, 2, context);

    expect(result.documents.map((p) => p.uuid)).toEqual(['one', 'two']);
    expect(result.checkpoint).toEqual({ ...checkpoint, offset: 2, restarts: 1 });
    expect(fetchSpy.mock.calls.map(([url]) => new URL(String(url)).searchParams.get('offset'))).toEqual(['4', '0']);
  });

  it("stores each page's X-WP-Total as pass_count", async () => {
    const checkpoint = { modified: '2026-01-01T08:00:00', offset: 2, pass_mark: '2026-01-02T08:00:00', pass_count: 5 };
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 3, uuid: 'three' }, { id: 4, uuid: 'four' }]), { headers: { 'X-WP-Total': '6' } }));

    const result = await wooProductReplication.pull.handler(checkpoint, 2, context);

    expect(result.checkpoint).toEqual({ ...checkpoint, offset: 4, pass_count: 6 });
  });

  it('restarts when X-WP-Total drops between two later pages', async () => {
    const checkpoint = { modified: '2026-01-01T08:00:00', offset: 2, pass_mark: '2026-01-02T08:00:00', pass_count: 5 };
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 3, uuid: 'three' }, { id: 4, uuid: 'four' }]), { headers: { 'X-WP-Total': '6' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 6, uuid: 'six' }]), { headers: { 'X-WP-Total': '5' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1, uuid: 'one' }, { id: 2, uuid: 'two' }]), { headers: { 'X-WP-Total': '5' } }));

    const first = await wooProductReplication.pull.handler(checkpoint, 2, context);
    const result = await wooProductReplication.pull.handler({ ...checkpoint, ...first.checkpoint }, 2, context);

    expect(first.checkpoint.pass_count).toBe(6);
    expect(result.documents.map((p) => p.uuid)).toEqual(['one', 'two']);
    expect(fetchSpy.mock.calls.map(([url]) => new URL(String(url)).searchParams.get('offset'))).toEqual(['2', '4', '0']);
  });

  it('gives up the pass at the restart cap without advancing the lower bound', async () => {
    const checkpoint = { modified: '2026-01-01T08:00:00', offset: 2, pass_mark: '2026-01-02T08:00:00', pass_count: 6, restarts: 3 };
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 3, uuid: 'three' }, { id: 4, uuid: 'four' }]), { headers: { 'X-WP-Total': '5' } }));

    const result = await wooProductReplication.pull.handler(checkpoint, 2, context);

    expect(result.documents).toEqual([]);
    expect(result.checkpoint).toStrictEqual({ modified: '2026-01-01T08:00:00', offset: 0, pass_mark: undefined, pass_count: undefined, restarts: undefined });
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('a product shifted behind the offset at the restart cap arrives on the next poll', async () => {
    const products = Array.from({ length: 10 }, (_, id) => ({
      id: id + 1, uuid: `u${id + 1}`, status: 'publish', date_modified_gmt: `2026-01-01T08:00:${String(id + 1).padStart(2, '0')}`,
    }));
    mockProductsEndpoint(products);
    let calls = 0;

    // Each call has returned the lowest-id product still in the store, so shift() removes one already read.
    const first = await pullRun(undefined, 2, () => {
      if (++calls <= 4) products.shift();
    });
    const next = await pullRun(first.checkpoint, 2);

    expect(next.documents.map((p) => p.uuid)).toContain('u6');
    const returned = new Set([...first.documents, ...next.documents].map((p) => p.uuid));
    for (const product of products) expect(returned).toContain(product.uuid);
  });

  it('counts restarts and clears them when the pass completes', async () => {
    const products = Array.from({ length: 6 }, (_, id) => ({
      id: id + 1, uuid: `uuid-${id + 1}`, status: 'publish', date_modified_gmt: '2026-01-01T08:00:00',
    }));
    mockProductsEndpoint(products);
    const restarts: (number | undefined)[] = [];

    const result = await pullRun(undefined, 2, (checkpoint) => {
      restarts.push(checkpoint.restarts);
      if (restarts.length <= 2) products.shift();
    });

    expect(restarts).toEqual([undefined, 1, 2, undefined, undefined]);
    expect(result.documents.map((p) => p.uuid)).toEqual(['uuid-1', 'uuid-2', 'uuid-2', 'uuid-3', 'uuid-3', 'uuid-4', 'uuid-5', 'uuid-6']);
    expect(result.checkpoint).toStrictEqual({ modified: '2026-01-01T08:00:00', offset: 0, pass_mark: undefined, pass_count: undefined, restarts: undefined });
  });

  it('returns no documents and no page request when the mark has not moved', async () => {
    const checkpoint = { modified: '2026-01-01T08:00:00', offset: 0 };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify([{ date_modified_gmt: checkpoint.modified }])));

    const result = await wooProductReplication.pull.handler(checkpoint, 2, context);

    expect(result.documents).toEqual([]);
    expect(result.checkpoint).toBe(checkpoint);
    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(`${context.baseUrl}/products?per_page=1&orderby=modified&order=desc`, expect.objectContaining({
      headers: { ...context.headers, 'Content-Type': 'application/json' },
    }));
  });

  it('sends modified_after one second before the pass lower bound, with dates_are_gmt=true', async () => {
    const checkpoint = { modified: '2026-01-01T08:00:00', offset: 0, pass_mark: '2026-01-02T08:00:00' };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('[]', { headers: { 'X-WP-Total': '0' } }));

    await wooProductReplication.pull.handler(checkpoint, 2, context);

    const params = new URL(String(fetchSpy.mock.calls[0][0])).searchParams;
    expect(params.get('modified_after')).toBe('2026-01-01T07:59:59');
    expect(params.get('dates_are_gmt')).toBe('true');
  });

  it('ends the pass on a short page when X-WP-Total is missing', async () => {
    const checkpoint = { modified: '', offset: 2, pass_mark: '2026-01-02T08:00:00' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify([{ id: 3, uuid: 'three' }])));

    const result = await wooProductReplication.pull.handler(checkpoint, 2, context);

    expect(result.documents.map((p) => p.uuid)).toEqual(['three']);
    expect(result.checkpoint).toEqual({ modified: checkpoint.pass_mark, offset: 0, pass_mark: undefined, pass_count: undefined });
  });

  it('keeps the pass open on a full page when X-WP-Total is empty', async () => {
    const checkpoint = { modified: '', offset: 0, pass_mark: '2026-01-02T08:00:00' };
    const products = [{ id: 1, uuid: 'one' }, { id: 2, uuid: 'two' }];
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(products), { headers: { 'X-WP-Total': '' } }));

    const result = await wooProductReplication.pull.handler(checkpoint, 2, context);

    expect(result.checkpoint).toEqual({ modified: '', offset: 2, pass_mark: '2026-01-02T08:00:00', pass_count: undefined });
  });

  it('reads an old { id, modified } checkpoint as offset 0', async () => {
    const checkpoint = { id: 'old', modified: '2026-01-01T08:00:00' };
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify([{ date_modified_gmt: '2026-01-02T08:00:00' }])))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1, uuid: 'one' }, { id: 2, uuid: 'two' }]), { headers: { 'X-WP-Total': '3' } }));

    const result = await wooProductReplication.pull.handler(checkpoint as unknown as WooProductCheckpoint, 2, context);

    expect(new URL(String(fetchSpy.mock.calls[1][0])).searchParams.get('offset')).toBe('0');
    expect(result.checkpoint).toEqual({ modified: checkpoint.modified, offset: 2, pass_mark: '2026-01-02T08:00:00', pass_count: 3 });
  });
});

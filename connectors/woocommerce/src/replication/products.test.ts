import { describe, it, expect, vi, beforeEach } from 'vitest';
import { errorKind, type SyncContext } from '@tallyui/core';

import { woocommerceConnector, WooDateFilterError, WooMissingUuidError } from '../index';
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

// A store with one product, for tests that read the page request (an empty store sends none).
const product = { id: 1, uuid: 'one', status: 'publish', date_modified_gmt: '2026-01-01T08:00:00' };
// At the lower bound of the windows these tests' checkpoints open (2026-01-01T08:00:00), so inside each page window.
const inWindow = { date_modified_gmt: '2026-01-01T08:00:00' };

// An empty store answers every request with []; the guard turns a runaway pull into a failure, not a hang.
function mockEmptyStore() {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    if (fetchSpy.mock.calls.length > 10) throw new Error('runaway pull');
    return new Response('[]');
  });
  return fetchSpy;
}

// RxDB's downstream loop: an empty result ends the run and its checkpoint is neither merged nor stored.
async function pullRun(checkpoint: WooProductCheckpoint | undefined, batchSize: number, onPage = (_checkpoint: WooProductCheckpoint) => {}) {
  const documents: any[] = [];
  for (let calls = 0; calls < 20; calls++) {
    const result = await wooProductReplication.pull.handler(checkpoint, batchSize, context);
    if (result.documents.length === 0) return { documents, checkpoint: checkpoint! };
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
    const fetchSpy = mockProductsEndpoint([product]);

    await wooProductReplication.pull.handler(checkpoint, 100, context);

    for (const [url] of fetchSpy.mock.calls) expect(new URL(String(url)).searchParams.has('status')).toBe(false);
  });

  it('fetches products after a checkpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    ).mockResolvedValueOnce(new Response('[]'));

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
    ).mockResolvedValueOnce(new Response('[]'));
    const checkpoint = { offset: 0, modified: '2026-01-01T00:00:00', pass_mark: '2026-01-02T00:00:00' };

    await wooProductReplication.pull.handler(checkpoint, 100, context);

    const params = new URL(String(fetchSpy.mock.calls[0][0])).searchParams;
    expect(params.get('modified_after')).toBe('2025-12-31T23:59:59');
    expect(params.get('dates_are_gmt')).toBe('true');
  });

  it('sends neither modified_after nor dates_are_gmt on the first pull', async () => {
    const fetchSpy = mockProductsEndpoint([product]);

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
    mockProductsEndpoint([product]);

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
    const products = [{ id: 1, uuid: 'one', ...inWindow }, { id: 2, uuid: 'two', ...inWindow }];
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 3, uuid: 'three', ...inWindow }, { id: 4, uuid: 'four', ...inWindow }]), { headers: { 'X-WP-Total': '4' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(products), { headers: { 'X-WP-Total': '4' } }));

    const result = await wooProductReplication.pull.handler(checkpoint, 2, context);

    expect(result.documents.map((p) => p.uuid)).toEqual(['one', 'two']);
    expect(result.checkpoint).toStrictEqual({ ...checkpoint, pass_count: 4 });
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
    expect(result.checkpoint).toEqual({ modified: '', offset: 4, pass_mark: '2026-01-04T08:00:00', pass_count: undefined });
    expect((await pullRun(result.checkpoint, 2)).documents).toEqual([]);
  });

  it('a pass completing on an empty page without X-WP-Total chains into the next pass', async () => {
    const products = Array.from({ length: 4 }, (_, id) => ({
      id: id + 1, uuid: `uuid-${id + 1}`, status: 'publish', date_modified_gmt: `2026-01-0${id + 1}T08:00:00`,
    }));
    const fetchSpy = mockProductsEndpoint(products, { total: false });
    const first = await pullRun(undefined, 2);
    Object.assign(products[0], { name: 'Edited', date_modified_gmt: '2026-01-05T08:00:00' });
    fetchSpy.mockClear();

    const result = await wooProductReplication.pull.handler(first.checkpoint, 2, context);

    expect(result.documents.map((p) => p.uuid)).toEqual(['uuid-1', 'uuid-4']);
    expect(result.documents[0].name).toBe('Edited');
    expect(result.checkpoint).toEqual({ modified: '2026-01-04T08:00:00', offset: 2, pass_mark: '2026-01-05T08:00:00', pass_count: undefined });
    expect(fetchSpy.mock.calls.map(([url]) => [...new URL(String(url)).searchParams].filter(([key]) => ['offset', 'orderby', 'modified_after'].includes(key)))).toEqual([
      [['offset', '4'], ['orderby', 'id']],
      [['orderby', 'modified'], ['modified_after', '2026-01-04T08:00:00']],
      [['offset', '0'], ['orderby', 'id'], ['modified_after', '2026-01-04T07:59:59']],
    ]);
  });

  it('a call stops at the request budget without moving the lower bound', async () => {
    const checkpoint = { modified: '2026-01-01T08:00:00', offset: 2, pass_mark: '2026-01-02T08:00:00', pass_count: 5 };
    let marks = 0;
    // Every page is empty and the mark moves on every request: only the budget ends the call.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (fetchSpy.mock.calls.length > 10) throw new Error('runaway pull');
      if (new URL(String(input)).searchParams.get('orderby') === 'modified') return new Response(JSON.stringify([{ date_modified_gmt: `2026-01-0${3 + marks++}T08:00:00` }]));
      return new Response('[]', { headers: { 'X-WP-Total': '0' } });
    });

    const result = await wooProductReplication.pull.handler(checkpoint, 2, context);

    expect(result.documents).toEqual([]);
    expect(result.checkpoint.modified).toBe(checkpoint.modified);
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect((await pullRun(checkpoint, 2)).checkpoint).toBe(checkpoint);
  });

  it('still restarts on an empty page at offset > 0 when X-WP-Total is present', async () => {
    const checkpoint = { modified: '2026-01-01T08:00:00', offset: 4, pass_mark: '2026-01-02T08:00:00', pass_count: 4 };
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('[]', { headers: { 'X-WP-Total': '4' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1, uuid: 'one', ...inWindow }, { id: 2, uuid: 'two', ...inWindow }]), { headers: { 'X-WP-Total': '4' } }));

    const result = await wooProductReplication.pull.handler(checkpoint, 2, context);

    expect(result.documents.map((p) => p.uuid)).toEqual(['one', 'two']);
    expect(result.checkpoint).toStrictEqual({ ...checkpoint, offset: 2 });
    expect(fetchSpy.mock.calls.map(([url]) => new URL(String(url)).searchParams.get('offset'))).toEqual(['4', '0']);
  });

  it("stores each page's X-WP-Total as pass_count", async () => {
    const checkpoint = { modified: '2026-01-01T08:00:00', offset: 2, pass_mark: '2026-01-02T08:00:00', pass_count: 5 };
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 3, uuid: 'three', ...inWindow }, { id: 4, uuid: 'four', ...inWindow }]), { headers: { 'X-WP-Total': '6' } }));

    const result = await wooProductReplication.pull.handler(checkpoint, 2, context);

    expect(result.checkpoint).toEqual({ ...checkpoint, offset: 4, pass_count: 6 });
  });

  it('restarts when X-WP-Total drops between two later pages', async () => {
    const checkpoint = { modified: '2026-01-01T08:00:00', offset: 2, pass_mark: '2026-01-02T08:00:00', pass_count: 5 };
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 3, uuid: 'three', ...inWindow }, { id: 4, uuid: 'four', ...inWindow }]), { headers: { 'X-WP-Total': '6' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 6, uuid: 'six', ...inWindow }]), { headers: { 'X-WP-Total': '5' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1, uuid: 'one', ...inWindow }, { id: 2, uuid: 'two', ...inWindow }]), { headers: { 'X-WP-Total': '5' } }));

    const first = await wooProductReplication.pull.handler(checkpoint, 2, context);
    const result = await wooProductReplication.pull.handler({ ...checkpoint, ...first.checkpoint }, 2, context);

    expect(first.checkpoint.pass_count).toBe(6);
    expect(result.documents.map((p) => p.uuid)).toEqual(['one', 'two']);
    expect(fetchSpy.mock.calls.map(([url]) => new URL(String(url)).searchParams.get('offset'))).toEqual(['2', '4', '0']);
  });

  it('restarts on every shrink without a stored counter', async () => {
    const products = Array.from({ length: 10 }, (_, id) => ({
      id: id + 1, uuid: `u${id + 1}`, status: 'publish', date_modified_gmt: '2026-01-01T08:00:00',
    }));
    const fetchSpy = mockProductsEndpoint(products);
    // A checkpoint stored by #233 may still carry its restart counter; RxDB merges it into every later call.
    let checkpoint: WooProductCheckpoint = { modified: '2026-01-01T08:00:00', offset: 2, pass_mark: '2026-01-01T08:00:00', pass_count: 10, restarts: 3 } as WooProductCheckpoint;

    for (let shrink = 1; shrink <= 5; shrink++) {
      products.shift();
      fetchSpy.mockClear();
      const result = await wooProductReplication.pull.handler(checkpoint, 2, context);

      expect(fetchSpy.mock.calls.map(([url]) => new URL(String(url)).searchParams.get('offset'))).toEqual(['2', '0']);
      expect(result.documents.map((p) => p.uuid)).toEqual([`u${shrink + 1}`, `u${shrink + 2}`]);
      expect(result.checkpoint).toStrictEqual({ modified: '2026-01-01T08:00:00', offset: 2, pass_mark: '2026-01-01T08:00:00', pass_count: 10 - shrink });
      expect('restarts' in result.checkpoint).toBe(false);
      checkpoint = { ...checkpoint, ...result.checkpoint };
    }
  });

  it('a product shifted behind the offset by repeated shrinks arrives, and a later edit on the next poll', async () => {
    const products = Array.from({ length: 10 }, (_, id) => ({
      id: id + 1, uuid: `u${id + 1}`, status: 'publish', date_modified_gmt: `2026-01-01T08:00:${String(id + 1).padStart(2, '0')}`,
    }));
    mockProductsEndpoint(products);
    let calls = 0;

    // Each call has returned the lowest-id product still in the store, so shift() removes one already read.
    const first = await pullRun(undefined, 2, () => {
      if (++calls <= 4) products.shift();
    });

    expect(first.documents.map((p) => p.uuid)).toContain('u6');
    const returned = new Set(first.documents.map((p) => p.uuid));
    for (const product of products) expect(returned).toContain(product.uuid);
    Object.assign(products[0], { date_modified_gmt: '2026-01-01T08:00:30' });
    expect((await pullRun(first.checkpoint, 2)).documents.map((p) => p.uuid)).toContain(products[0].uuid);
  });

  it('restarts on each shrink and clears the pass state when the pass completes', async () => {
    const products = Array.from({ length: 6 }, (_, id) => ({
      id: id + 1, uuid: `uuid-${id + 1}`, status: 'publish', date_modified_gmt: '2026-01-01T08:00:00',
    }));
    mockProductsEndpoint(products);
    let pages = 0;

    const result = await pullRun(undefined, 2, () => {
      if (++pages <= 2) products.shift();
    });

    expect(result.documents.map((p) => p.uuid)).toEqual(['uuid-1', 'uuid-2', 'uuid-2', 'uuid-3', 'uuid-3', 'uuid-4', 'uuid-5', 'uuid-6']);
    expect(result.checkpoint).toStrictEqual({ modified: '2026-01-01T08:00:00', offset: 0, pass_mark: undefined, pass_count: undefined });
  });

  it('returns no documents and no page request when the mark has not moved', async () => {
    const checkpoint = { modified: '2026-01-01T08:00:00', offset: 0 };
    const fetchSpy = mockProductsEndpoint([{ ...product, date_modified_gmt: checkpoint.modified }]);

    const result = await wooProductReplication.pull.handler(checkpoint, 2, context);

    expect(result.documents).toEqual([]);
    expect(result.checkpoint).toBe(checkpoint);
    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(`${context.baseUrl}/products?per_page=1&orderby=modified&order=desc&modified_after=2026-01-01T08%3A00%3A00&dates_are_gmt=true`, expect.objectContaining({
      headers: { ...context.headers, 'Content-Type': 'application/json' },
    }));
  });

  it("returns early when the store's newest product is older than the lower bound", async () => {
    // The most recently edited product was trashed, so the newest left is below the window.
    const checkpoint = { modified: '2026-01-02T08:00:00', offset: 0 };
    const fetchSpy = mockProductsEndpoint([product]);

    const result = await wooProductReplication.pull.handler(checkpoint, 2, context);

    expect(result.documents).toEqual([]);
    expect(result.checkpoint).toBe(checkpoint);
    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(`${context.baseUrl}/products?per_page=1&orderby=modified&order=desc&modified_after=2026-01-02T08%3A00%3A00&dates_are_gmt=true`, expect.anything());
  });

  it.each([undefined, { modified: '2026-01-01T08:00:00', offset: 0 }])('returns at once without a page request when the store has no products', async (checkpoint) => {
    const fetchSpy = mockEmptyStore();

    const result = await wooProductReplication.pull.handler(checkpoint, 2, context);

    expect(result.documents).toEqual([]);
    expect(result.checkpoint).toStrictEqual(checkpoint ?? { modified: '', offset: 0 });
    const newer = checkpoint ? '&modified_after=2026-01-01T08%3A00%3A00&dates_are_gmt=true' : '';
    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(`${context.baseUrl}/products?per_page=1&orderby=modified&order=desc${newer}`, expect.anything());
  });

  it('the mark request asks for products modified after the lower bound in GMT', async () => {
    const fetchSpy = mockProductsEndpoint([{ ...product, date_modified_gmt: '2026-01-01T08:00:01' }]);

    const result = await wooProductReplication.pull.handler({ modified: '2026-01-01T08:00:00', offset: 0 }, 2, context);

    expect(fetchSpy.mock.calls[0][0]).toBe(`${context.baseUrl}/products?per_page=1&orderby=modified&order=desc&modified_after=2026-01-01T08%3A00%3A00&dates_are_gmt=true`);
    expect(result.checkpoint.modified).toBe('2026-01-01T08:00:01');
  });

  it.each([undefined, { modified: '', offset: 0 }])("the first sync's mark request carries no modified_after", async (checkpoint) => {
    const fetchSpy = mockProductsEndpoint([product]);

    await wooProductReplication.pull.handler(checkpoint, 2, context);

    expect(fetchSpy.mock.calls[0][0]).toBe(`${context.baseUrl}/products?per_page=1&orderby=modified&order=desc`);
  });

  it('sends modified_after as GMT digits without an offset', async () => {
    const fetchSpy = mockProductsEndpoint([{ ...product, date_modified_gmt: '2026-01-01T08:00:01' }]);

    await wooProductReplication.pull.handler({ modified: '2026-01-01T08:00:00', offset: 0 }, 2, context);

    // WP_Date_Query moves a time with Z or an offset into the site's time zone before comparing it with post_modified_gmt.
    const sent = fetchSpy.mock.calls.map(([url]) => new URL(String(url)).searchParams.get('modified_after'));
    expect(sent).toHaveLength(2);
    for (const after of sent) expect(after).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  it('rejects with WooDateFilterError when the store ignores modified_after on the mark request', async () => {
    // The store answers every request as if modified_after were absent.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (fetchSpy.mock.calls.length > 10) throw new Error('runaway pull');
      if (new URL(String(input)).searchParams.get('orderby') === 'modified') return new Response(JSON.stringify([{ ...product, id: 7 }]));
      return new Response('[]', { headers: { 'X-WP-Total': '0' } });
    });

    const result = wooProductReplication.pull.handler({ modified: '2026-01-01T08:00:00', offset: 0 }, 2, context);

    await expect(result).rejects.toBeInstanceOf(WooDateFilterError);
    await expect(result).rejects.toMatchObject({
      name: 'WooDateFilterError',
      code: 'unsupported_store',
      message: 'This store needs WooCommerce 5.8 or later to sync products.',
      productId: 7, bound: '2026-01-01T08:00:00', received: '2026-01-01T08:00:00',
    });
  });

  it.each(['2026-01-01T07:59:59', undefined])('rejects with WooDateFilterError when a page holds a product older than the lower bound', async (received) => {
    const checkpoint = { modified: '2026-01-01T08:00:00', offset: 0, pass_mark: '2026-01-02T08:00:00' };
    const page = [{ id: 1, uuid: 'one', ...inWindow }, { id: 2, uuid: 'two', date_modified_gmt: received }];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      if (fetchSpy.mock.calls.length > 10) throw new Error('runaway pull');
      return new Response(JSON.stringify(page), { headers: { 'X-WP-Total': '2' } });
    });

    const result = wooProductReplication.pull.handler(checkpoint, 2, context);

    await expect(result).rejects.toBeInstanceOf(WooDateFilterError);
    await expect(result).rejects.toMatchObject({
      code: 'unsupported_store',
      message: 'This store needs WooCommerce 5.8 or later to sync products.',
      productId: 2, bound: '2026-01-01T07:59:59', received,
    });
  });

  it('sends modified_after one second before the pass lower bound, with dates_are_gmt=true', async () => {
    const checkpoint = { modified: '2026-01-01T08:00:00', offset: 0, pass_mark: '2026-01-02T08:00:00' };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('[]', { headers: { 'X-WP-Total': '0' } }))
      .mockResolvedValueOnce(new Response('[]'));

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
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1, uuid: 'one', ...inWindow }, { id: 2, uuid: 'two', ...inWindow }]), { headers: { 'X-WP-Total': '3' } }));

    const result = await wooProductReplication.pull.handler(checkpoint as unknown as WooProductCheckpoint, 2, context);

    expect(new URL(String(fetchSpy.mock.calls[1][0])).searchParams.get('offset')).toBe('0');
    expect(result.checkpoint).toEqual({ modified: checkpoint.modified, offset: 2, pass_mark: '2026-01-02T08:00:00', pass_count: 3 });
  });

  it('WooDateFilterError is fixed by the store, and names the software and version it needs', () => {
    const error = new WooDateFilterError(1, 'b', 'r');
    expect(errorKind(error)).toBe('store');
    expect(error).toMatchObject({ code: 'unsupported_store', fixedBy: 'store', software: 'WooCommerce', minVersion: '5.8' });
    expect(error.message).toBe('This store needs WooCommerce 5.8 or later to sync products.');
  });

  it('WooMissingUuidError is fixed by the store, with the missing_plugin code', () => {
    const error = new WooMissingUuidError(1);
    expect(errorKind(error)).toBe('store');
    expect(error).toMatchObject({ code: 'missing_plugin', fixedBy: 'store' });
  });
});

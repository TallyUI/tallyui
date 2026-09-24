import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SyncContext } from '@tallyui/core';
import { MEDUSA_PRODUCT_FIELDS } from '../replication/products';
import { fetchByIds, fetchPages, variantIds } from './ids';

const context: SyncContext = {
  connectorId: 'medusa',
  baseUrl: 'https://my-medusa-backend.com',
  headers: { Authorization: 'Bearer test_token' },
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('fetchPages', () => {
  it('pages by offset, in id order, with fields=id,variants.id, until count', async () => {
    const page = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({
      id: `prod_${from + i}`, variants: [{ id: `v${from + i}a` }, { id: `v${from + i}b` }],
    }));
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ products: page(0, 1000), count: 1200 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ products: page(1000, 200), count: 1200 })));

    const pages: Array<Array<{ id: string; variantIds: string[] }>> = [];
    for await (const rows of fetchPages(context)) pages.push(rows);

    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(1000);
    expect(pages[1]).toHaveLength(200);
    expect(pages[0][0]).toEqual({ id: 'prod_0', variantIds: ['v0a', 'v0b'] });

    const urls = fetchSpy.mock.calls.map((c) => new URL(String(c[0])));
    expect(urls.map((u) => u.searchParams.get('offset'))).toEqual(['0', '1000']);
    for (const url of urls) {
      expect(url.searchParams.get('order')).toBe('id');
      expect(url.searchParams.get('fields')).toBe('id,variants.id');
      expect(url.searchParams.get('limit')).toBe('1000');
    }
    for (const [, init] of fetchSpy.mock.calls) {
      expect((init as RequestInit).headers).toMatchObject(context.headers);
    }
  });

  it('stops once offset reaches count, even mid-page', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ products: [{ id: 'prod_0', variants: [] }], count: 1 })),
    );
    const pages = [];
    for await (const rows of fetchPages(context)) pages.push(rows);
    expect(pages).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('variantIds', () => {
  it('reads variant ids off a local document', () => {
    expect(variantIds({ variants: [{ id: 'v1' }, { id: 2 }] })).toEqual(['v1', '2']);
    expect(variantIds({})).toEqual([]);
  });
});

describe('fetchByIds', () => {
  it('sends id[]= params, at most 100 per request, with the replication fields, and projects the results', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `prod_${i}`);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const params = new URL(String(input)).searchParams;
      const requested = params.getAll('id[]');
      return new Response(JSON.stringify({
        products: requested.map((id) => ({ id, title: `Title ${id}`, extra_junk: 'discarded' })),
        count: requested.length,
      }));
    });

    const result = await fetchByIds(ids, context);

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const calls = fetchSpy.mock.calls.map((c) => new URL(String(c[0])));
    expect(calls.map((u) => u.searchParams.getAll('id[]').length)).toEqual([100, 100, 50]);
    for (const url of calls) {
      expect(url.searchParams.get('fields')).toBe(MEDUSA_PRODUCT_FIELDS);
    }
    expect(result.map((p: any) => p.id)).toEqual(ids);
    // Projected through the replication's toDocument: only schema fields survive.
    expect(result[0]).toEqual({ id: 'prod_0', title: 'Title prod_0' });
  });

  it('returns nothing for an empty id list, without a request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await fetchByIds([], context)).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('a non-OK response', () => {
  it('throws with Medusa\'s JSON message, from fetchPages', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Access denied' }), { status: 403 }),
    );
    await expect(fetchPages(context)[Symbol.asyncIterator]().next()).rejects.toThrow('Medusa API error: 403: Access denied');
  });

  it('throws with Medusa\'s status, from fetchByIds, when the body has no message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }));
    await expect(fetchByIds(['prod_1'], context)).rejects.toThrow('Medusa API error: 500');
  });
});

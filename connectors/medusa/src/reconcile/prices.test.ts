import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SyncContext } from '@tallyui/core';
import { fetchPages, fingerprint, MEDUSA_PRICE_RECONCILE_INTERVAL_MS } from './prices';

const context: SyncContext = {
  connectorId: 'medusa',
  baseUrl: 'https://my-medusa-backend.com',
  headers: { Authorization: 'Bearer test_token' },
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('fetchPages', () => {
  it('pages by offset, in id order, with the exact fields, until count', async () => {
    const variant = (n: number) => ({
      id: `v${n}`, product_id: `prod_${n}`, prices: [{ amount: 1000, currency_code: 'usd', price_list_id: null }],
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ variants: Array.from({ length: 1000 }, (_, i) => variant(i)), count: 1200 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ variants: Array.from({ length: 200 }, (_, i) => variant(1000 + i)), count: 1200 })));

    const pages: Array<Map<string, string>> = [];
    for await (const page of fetchPages(context)) pages.push(page);

    expect(pages).toHaveLength(2);
    expect(pages[0].size).toBe(1000);
    expect(pages[1].size).toBe(200);

    const urls = fetchSpy.mock.calls.map((c) => new URL(String(c[0])));
    expect(urls.map((u) => u.searchParams.get('offset'))).toEqual(['0', '1000']);
    for (const url of urls) {
      expect(url.searchParams.get('order')).toBe('id');
      expect(url.searchParams.get('limit')).toBe('1000');
      expect(url.searchParams.get('fields')).toBe('id,product_id,prices.amount,prices.currency_code,prices.price_list_id');
    }
    for (const [, init] of fetchSpy.mock.calls) {
      expect((init as RequestInit).headers).toMatchObject(context.headers);
    }
  });

  it('groups by product_id and ignores price-list prices, regardless of variant or price order', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      variants: [
        { id: 'v2', product_id: 'prod_1', prices: [{ amount: 500, currency_code: 'usd', price_list_id: null }] },
        {
          id: 'v1',
          product_id: 'prod_1',
          prices: [
            { amount: 900, currency_code: 'usd', price_list_id: 'plist_1' }, // sale price, excluded
            { amount: 1000, currency_code: 'usd', price_list_id: null },
          ],
        },
      ],
      count: 2,
    })));

    const pages: Array<Map<string, string>> = [];
    for await (const page of fetchPages(context)) pages.push(page);

    expect(pages).toHaveLength(1);
    expect(pages[0].get('prod_1')).toBe('v1:usd:1000|v2:usd:500');
  });
});

describe('fingerprint', () => {
  it('ignores the order of variants and prices', () => {
    const a = fingerprint({
      variants: [
        { id: 'v1', prices: [{ amount: 1000, currency_code: 'usd' }, { amount: 900, currency_code: 'eur' }] },
        { id: 'v2', prices: [{ amount: 500, currency_code: 'usd' }] },
      ],
    });
    const b = fingerprint({
      variants: [
        { id: 'v2', prices: [{ amount: 500, currency_code: 'usd' }] },
        { id: 'v1', prices: [{ amount: 900, currency_code: 'eur' }, { amount: 1000, currency_code: 'usd' }] },
      ],
    });
    expect(a).toBe(b);
  });

  it('skips a price with a price_list_id', () => {
    expect(fingerprint({
      variants: [{ id: 'v1', prices: [
        { amount: 1000, currency_code: 'usd' },
        { amount: 900, currency_code: 'usd', price_list_id: 'plist_1' },
      ] }],
    })).toBe('v1:usd:1000');
  });

  it('is the empty string for a product with no variants', () => {
    expect(fingerprint({ variants: [] })).toBe('');
    expect(fingerprint({})).toBe('');
  });
});

describe('a local document and a remote row describing the same prices', () => {
  it('give equal fingerprints', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      variants: [
        { id: 'v1', product_id: 'prod_1', prices: [{ amount: 1000, currency_code: 'usd', price_list_id: null }] },
        { id: 'v2', product_id: 'prod_1', prices: [{ amount: 500, currency_code: 'usd', price_list_id: null }] },
      ],
      count: 2,
    })));
    const pages: Array<Map<string, string>> = [];
    for await (const page of fetchPages(context)) pages.push(page);
    const remote = pages[0].get('prod_1')!;

    const local = fingerprint({
      variants: [
        { id: 'v1', prices: [{ amount: 1000, currency_code: 'usd' }] },
        { id: 'v2', prices: [{ amount: 500, currency_code: 'usd' }] },
      ],
    });
    expect(local).toBe(remote);
  });
});

describe('MEDUSA_PRICE_RECONCILE_INTERVAL_MS', () => {
  it('is 24 hours, the nightly backstop', () => {
    expect(MEDUSA_PRICE_RECONCILE_INTERVAL_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe('a non-OK response', () => {
  it('throws with Medusa\'s JSON message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Access denied' }), { status: 403 }),
    );
    await expect(fetchPages(context)[Symbol.asyncIterator]().next()).rejects.toThrow('Medusa API error: 403: Access denied');
  });
});

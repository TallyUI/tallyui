import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SyncContext } from '@tallyui/core';
import { fetchPages, fingerprint, VENDURE_PRICE_RECONCILE_INTERVAL_MS } from './prices';
import { createVendureConnector } from '../index';

const context: SyncContext = { connectorId: 'vendure', baseUrl: 'https://vendure.test', headers: { Authorization: 'Bearer t' } };

const variant = (id: string, productId: string, price: number, priceWithTax = price + 100) => (
  { id, productId, price, priceWithTax, currencyCode: 'USD' }
);
const page = (items: ReturnType<typeof variant>[], totalItems: number) => new Response(JSON.stringify({
  data: { productVariants: { items, totalItems } },
}));

describe('fetchPages', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is wired as reconcile.prices', () => {
    const connector = createVendureConnector();
    expect(connector.reconcile?.prices?.fetchPages).toBe(fetchPages);
    expect(connector.reconcile?.prices?.fingerprint).toBe(fingerprint);
  });

  it('pages 1,000 variants at a time by id, until totalItems', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(page([variant('v1', 'p1', 1000)], 1001))
      .mockResolvedValueOnce(page([variant('v2', 'p2', 2000)], 1001));

    const pages: Array<Map<string, string>> = [];
    for await (const p of fetchPages(context)) pages.push(p);

    expect(pages).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    const bodies = fetch.mock.calls.map(([, init]) => JSON.parse(init!.body as string));
    expect(bodies[0].query).toContain('productVariants');
    expect(bodies.map((b) => b.variables.options)).toEqual([0, 1000].map((skip) => ({ take: 1000, skip, sort: { id: 'ASC' } })));
  });

  it('recomputes a product\'s fingerprint from every variant seen so far, when its variants span pages', async () => {
    // totalItems above the 1,000-row page size forces a real second page.
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(page([variant('v1', 'p1', 1000, 1100)], 1001)).mockResolvedValueOnce(page([variant('v2', 'p1', 2000, 2100)], 1001));

    const pages: Array<Map<string, string>> = [];
    for await (const p of fetchPages(context)) pages.push(p);

    expect(pages).toHaveLength(2);
    expect(pages[0].get('p1')).toBe('v1:USD:1000:1100');
    // The second page's entry for p1 is recomputed from both variants, not just the new one.
    expect(pages[1].get('p1')).toBe('v1:USD:1000:1100|v2:USD:2000:2100');
  });

  it('throws GraphQL errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ message: 'Forbidden' }] })));
    await expect(fetchPages(context)[Symbol.asyncIterator]().next()).rejects.toThrow('Vendure GraphQL error: Forbidden');
  });
});

describe('fingerprint', () => {
  it('ignores the order of variants', () => {
    const a = fingerprint({
      variants: [
        { id: 'v1', currencyCode: 'USD', price: 1000, priceWithTax: 1100 },
        { id: 'v2', currencyCode: 'USD', price: 2000, priceWithTax: 2100 },
      ],
    });
    const b = fingerprint({
      variants: [
        { id: 'v2', currencyCode: 'USD', price: 2000, priceWithTax: 2100 },
        { id: 'v1', currencyCode: 'USD', price: 1000, priceWithTax: 1100 },
      ],
    });
    expect(a).toBe(b);
  });

  it('is the empty string for a product with no variants', () => {
    expect(fingerprint({ variants: [] })).toBe('');
    expect(fingerprint({})).toBe('');
  });
});

describe('a local document and a remote row describing the same prices', () => {
  it('give equal fingerprints', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(page([variant('v1', 'p1', 1000, 1100), variant('v2', 'p1', 2000, 2100)], 2));
    const pages: Array<Map<string, string>> = [];
    for await (const p of fetchPages(context)) pages.push(p);
    const remote = pages[0]!.get('p1')!;

    const local = fingerprint({
      variants: [
        { id: 'v1', currencyCode: 'USD', price: 1000, priceWithTax: 1100 },
        { id: 'v2', currencyCode: 'USD', price: 2000, priceWithTax: 2100 },
      ],
    });
    expect(local).toBe(remote);
  });
});

describe('VENDURE_PRICE_RECONCILE_INTERVAL_MS', () => {
  it('is 24 hours, the nightly backstop', () => {
    expect(VENDURE_PRICE_RECONCILE_INTERVAL_MS).toBe(24 * 60 * 60 * 1000);
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SyncContext } from '@tallyui/core';

import { vendureStockReconcile } from './stock';
import { createVendureConnector } from '../index';

const context: SyncContext = { connectorId: 'vendure', baseUrl: 'https://vendure.test', headers: { Authorization: 'Bearer t' } };

const level = (stockOnHand: number, stockAllocated = 0) => ({ stockLocationId: '1', stockOnHand, stockAllocated });
const page = (ids: string[], totalItems: number) => new Response(JSON.stringify({
  data: { productVariants: { items: ids.map((id) => ({ id, stockLevels: [level(Number(id))] })), totalItems } },
}));

describe('vendureStockReconcile', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is wired as reconcile.stock', () => {
    expect(createVendureConnector().reconcile?.stock).toBe(vendureStockReconcile);
  });

  it('pages 1,000 variants at a time by id until totalItems', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(page(['1', '2'], 2001))
      .mockResolvedValueOnce(page(['3'], 2001))
      .mockResolvedValueOnce(page(['4'], 2001));

    const pages = [];
    for await (const p of vendureStockReconcile.fetchPages(context)) pages.push(p);

    expect(pages).toHaveLength(3);
    expect(pages[0].get('2')).toEqual([level(2)]);
    expect(fetch).toHaveBeenCalledTimes(3);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://vendure.test/admin-api');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer t');
    const bodies = fetch.mock.calls.map(([, i]) => JSON.parse(i!.body as string));
    expect(bodies[0].query).toContain('productVariants');
    expect(bodies.map((b) => b.variables.options)).toEqual([0, 1000, 2000].map((skip) => ({ take: 1000, skip, sort: { id: 'ASC' } })));
  });

  it('throws GraphQL errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ message: 'Forbidden' }] })));
    await expect(vendureStockReconcile.fetchPages(context)[Symbol.asyncIterator]().next()).rejects.toThrow('Vendure GraphQL error: Forbidden');
  });

  const doc = {
    id: 'p1',
    variants: [
      { id: 'v1', name: 'A', stockLevels: [level(5, 1)] },
      { id: 'v2', name: 'B', stockLevels: [level(3)] },
      { id: 'v3', name: 'C', stockLevels: [level(8)] },
    ],
  };

  it('replaces only the changed variant stockLevels', () => {
    const stock = new Map<string, unknown>([['v1', [level(5, 1)]], ['v2', [level(3, 2)]]]);
    const patch = vendureStockReconcile.patch(doc, stock);
    expect(patch).toEqual({ variants: [doc.variants[0], { ...doc.variants[1], stockLevels: [level(3, 2)] }, doc.variants[2]] });
    expect(patch!.variants).not.toBe(doc.variants);
    expect(doc.variants[1].stockLevels).toEqual([level(3)]);
  });

  it('returns undefined when nothing differs, whatever the key order', () => {
    const stock = new Map<string, unknown>([
      ['v1', [{ stockAllocated: 1, stockOnHand: 5, stockLocationId: '1' }]],
      ['v2', [level(3)]],
      ['other', [level(0)]],
    ]);
    expect(vendureStockReconcile.patch(doc, stock)).toBeUndefined();
  });

  it('returns undefined for the same levels in a different order', () => {
    const second = { stockLocationId: '2', stockOnHand: 4, stockAllocated: 0 };
    const multi = { id: 'p2', variants: [{ id: 'v1', stockLevels: [level(5, 1), second] }] };
    expect(vendureStockReconcile.patch(multi, new Map([['v1', [second, level(5, 1)]]]))).toBeUndefined();
  });
});

import { describe, it, expect } from 'vitest';
import app from '../index';
import { products } from '../data/catalog';
import { toVendureProduct } from '../transforms/vendure';

describe('Vendure product endpoints', () => {
  it.each(['admin-api', 'shop-api'])('POST /vendure/%s filters, sorts and pages products', async (endpoint) => {
    const catalog = products.map(toVendureProduct);
    const timestamp = [...catalog].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0].updatedAt;
    const after = new Date(Date.parse(timestamp) - 1).toISOString();
    const expected = catalog.filter((p) => Date.parse(p.updatedAt) > Date.parse(after))
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(expected.length).toBeGreaterThan(2);
    const response = await app.request(`/vendure/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'query { products { items { id } } }', variables: {
        options: { take: 2, skip: 1, sort: { id: 'ASC' }, filter: { updatedAt: { after } } },
      } }),
    });
    expect(response.status).toBe(200);
    const { data } = await response.json() as any;
    expect(data.products.totalItems).toBe(expected.length);
    expect(data.products.items.map((p: any) => p.id)).toEqual(expected.slice(1, 3).map((p) => p.id));
    const filtered = await app.request(`/vendure/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'query { products { items { id } } }', variables: {
        options: { filter: { updatedAt: { after: timestamp } } },
      } }),
    });
    expect(filtered.status).toBe(200);
    const filteredBody = await filtered.json() as any;
    expect(filteredBody.data.products.items).toEqual(catalog.filter((p) => Date.parse(p.updatedAt) > Date.parse(timestamp)));
    expect(filteredBody.data.products.totalItems).toBe(0);
    expect(data.products.items[0].variants[0].stockLevels).toEqual([{
      stockLocationId: '1', stockOnHand: expected[1].variants[0].stockOnHand, stockAllocated: 0,
    }]);
  });
});

import { describe, it, expect } from 'vitest';
import app from '../index';
import { products } from '../data/catalog';

// Medusa 2.21 honours only the `updated_at[$gte]` operator form; the bracket
// form without the `$` is a different query key and is silently dropped, so
// it must return the full, unfiltered catalogue.
const future = '2099-01-01T00:00:00.000Z';

describe('GET /medusa/admin/products updated_at filter', () => {
  it('updated_at[$gte] with a future mark filters to an empty catalogue', async () => {
    const response = await app.request(`/medusa/admin/products?updated_at[$gte]=${future}`);
    expect(response.status).toBe(200);
    const body = await response.json() as { count: number; products: unknown[] };
    expect(body.count).toBe(0);
    expect(body.products).toEqual([]);
  });

  it('updated_at[gte] (no operator) with the same mark is ignored: the full catalogue comes back', async () => {
    const response = await app.request(`/medusa/admin/products?updated_at[gte]=${future}`);
    expect(response.status).toBe(200);
    const body = await response.json() as { count: number; products: unknown[] };
    expect(body.count).toBe(products.length);
  });
});

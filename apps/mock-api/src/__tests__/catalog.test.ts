import { describe, it, expect } from 'vitest';
import { products } from '../data/catalog';
import type { NeutralProduct } from '../data/types';

describe('product catalog', () => {
  it('has at least 25 products', () => {
    expect(products.length).toBeGreaterThanOrEqual(25);
  });

  it('every product has required fields', () => {
    for (const p of products) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.slug).toBeTruthy();
      expect(p.variants.length).toBeGreaterThanOrEqual(1);
      expect(p.categories.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('has unique IDs', () => {
    const ids = products.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique SKUs across all variants', () => {
    const skus = products.flatMap((p) => p.variants.map((v) => v.sku));
    expect(new Set(skus).size).toBe(skus.length);
  });

  it('covers all product types', () => {
    const types = new Set(products.map((p) => p.type));
    expect(types).toContain('simple');
    expect(types).toContain('variable');
  });

  it('covers all stock statuses', () => {
    const statuses = new Set(
      products.flatMap((p) => p.variants.map((v) => v.stockStatus))
    );
    expect(statuses).toContain('instock');
    expect(statuses).toContain('outofstock');
    expect(statuses).toContain('onbackorder');
  });

  it('has some products on sale', () => {
    const onSale = products.filter((p) =>
      p.variants.some((v) => v.compareAtPrice !== null)
    );
    expect(onSale.length).toBeGreaterThanOrEqual(3);
  });

  it('has products across all categories', () => {
    const categories = new Set(
      products.flatMap((p) => p.categories.map((c) => c.slug))
    );
    expect(categories.size).toBeGreaterThanOrEqual(5);
  });

  it('prices are in cents (positive integers)', () => {
    for (const p of products) {
      for (const v of p.variants) {
        expect(Number.isInteger(v.price)).toBe(true);
        expect(v.price).toBeGreaterThan(0);
        if (v.compareAtPrice !== null) {
          expect(Number.isInteger(v.compareAtPrice)).toBe(true);
          expect(v.compareAtPrice).toBeGreaterThan(v.price);
        }
      }
    }
  });
});

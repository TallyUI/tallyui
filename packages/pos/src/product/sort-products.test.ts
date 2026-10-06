import { describe, expect, it, vi } from 'vitest';
import { wooProductTraits } from '@tallyui/connector-woocommerce';
import { PRODUCT_SORT_FIELDS, productSortValue, sortProducts, type ProductSortValue } from './sort-products';

const doc = {
  id: 1, name: 'Item 2', sku: 'SKU-2', barcode: '12345', regular_price: '12.50',
  stock_quantity: 8, categories: [{ name: 'Coffee' }, { name: 'Equipment' }],
};

describe('productSortValue', () => {
  it('reads all six fields in the default column order', () => {
    expect(PRODUCT_SORT_FIELDS).toEqual(['name', 'sku', 'barcode', 'price', 'stock', 'category']);
    expect(PRODUCT_SORT_FIELDS.map((field) => productSortValue(doc, field, wooProductTraits, { currency: 'USD' })))
      .toEqual(['Item 2', 'SKU-2', '12345', 1250, 8, 'Coffee, Equipment']);
  });

  it('uses the lowest resolved variant price for a variable product', () => {
    const variable = { ...doc, type: 'variable', variation_docs: [
      { id: 11, status: 'publish', regular_price: '20.00' },
      { id: 12, status: 'publish', regular_price: '18.00', sale_price: '10.00', on_sale: true },
    ] };
    expect(productSortValue(variable, 'price', wooProductTraits, { currency: 'USD' })).toBe(1000);
  });

  it('returns undefined for an unknown field and empty strings', () => {
    expect(productSortValue(doc, 'unknown', wooProductTraits)).toBeUndefined();
    expect(productSortValue({ ...doc, sku: '' }, 'sku', wooProductTraits)).toBeUndefined();
    expect(productSortValue({ ...doc, name: '' }, 'name', wooProductTraits)).toBeUndefined();
    expect(productSortValue({ ...doc, categories: [] }, 'category', wooProductTraits)).toBeUndefined();
  });
});

describe('sortProducts', () => {
  it.each(['asc', 'desc'] as const)('sorts strings %s naturally, ignoring case', (dir) => {
    const docs = [{ name: 'Item 10' }, { name: 'item 2' }, { name: 'Item 2' }, { name: 'Apple' }];
    const result = sortProducts(docs, { field: 'name', dir }, (item) => item.name);
    expect(result).toEqual(dir === 'asc' ? [docs[3], docs[1], docs[2], docs[0]] : [docs[0], docs[1], docs[2], docs[3]]);
    expect(result).not.toBe(docs);
    expect(docs.map((item) => item.name)).toEqual(['Item 10', 'item 2', 'Item 2', 'Apple']);
  });

  it.each(['asc', 'desc'] as const)('sorts numbers %s', (dir) => {
    expect(sortProducts([10, 2, 0], { field: 'price', dir }, (value) => value))
      .toEqual(dir === 'asc' ? [0, 2, 10] : [10, 2, 0]);
  });

  it.each(['asc', 'desc'] as const)('puts undefined and empty strings last for %s', (dir) => {
    const values: ProductSortValue[] = [undefined, 2, '', 1];
    expect(sortProducts(values, { field: 'value', dir }, (value) => value))
      .toEqual(dir === 'asc' ? [1, 2, undefined, ''] : [2, 1, undefined, '']);
  });

  it.each(['asc', 'desc'] as const)('orders mixed types for %s', (dir) => {
    const values = ['1', 2, '10', 0];
    expect(sortProducts(values, { field: 'value', dir }, (value) => value))
      .toEqual(dir === 'asc' ? [0, 2, '1', '10'] : ['10', '1', 2, 0]);
  });

  it.each(['asc', 'desc'] as const)('keeps input order for ties for %s', (dir) => {
    const docs = [{ id: 3 }, { id: 1 }, { id: 2 }];
    expect(sortProducts(docs, { field: 'value', dir }, () => 5)).toEqual(docs);
  });

  it.each([null, undefined])('returns the original array with sort=%s', (sort) => {
    const docs = [doc];
    const valueOf = vi.fn();
    expect(sortProducts(docs, sort, valueOf)).toBe(docs);
    expect(valueOf).not.toHaveBeenCalled();
  });

  it('computes each value once, passing the sort field', () => {
    const docs = [{ name: 'C' }, { name: 'A' }, { name: 'B' }];
    const valueOf = vi.fn((item: typeof docs[number]) => item.name);
    sortProducts(docs, { field: 'name', dir: 'asc' }, valueOf);
    expect(valueOf.mock.calls).toEqual(docs.map((item) => [item, 'name']));
  });
});

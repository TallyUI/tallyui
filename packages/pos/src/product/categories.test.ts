import { describe, it, expect } from 'vitest';
import { medusaProductTraits } from '@tallyui/connector-medusa';
import { wooProductTraits } from '@tallyui/connector-woocommerce';
import { productCategories, listCategories, inCategory } from './categories';

describe('listCategories', () => {
  it('lists each id once across three docs, keeping the first name seen', () => {
    const docs = [
      { id: 1, name: 'Beans', categories: [{ id: 1, name: 'Coffee' }] },
      { id: 2, name: 'Grinder', categories: [
        { id: 1, name: 'Renamed Coffee' }, { id: 2, name: 'Equipment' },
      ] },
      { id: 3, name: 'Machine', categories: [{ id: 2, name: 'Renamed Equipment' }] },
    ];
    expect(listCategories(docs, wooProductTraits)).toEqual([
      { id: '1', name: 'Coffee' }, { id: '2', name: 'Equipment' },
    ]);
  });

  it('sorts names naturally and ignores case', () => {
    const docs = [{ id: 1, name: 'Product', categories: [
      { id: 1, name: 'Item 10' }, { id: 2, name: 'Banana' },
      { id: 3, name: 'item 2' }, { id: 4, name: 'apple' },
    ] }];
    expect(listCategories(docs, wooProductTraits)).toEqual([
      { id: '4', name: 'apple' }, { id: '2', name: 'Banana' },
      { id: '3', name: 'item 2' }, { id: '1', name: 'Item 10' },
    ]);
  });

  it('orders equal names by string id', () => {
    const docs = [{ id: 1, name: 'Product', categories: [
      { id: 2, name: 'Coffee' }, { id: 10, name: 'Coffee' }, { id: 1, name: 'Coffee' },
    ] }];
    expect(listCategories(docs, wooProductTraits)).toEqual([
      { id: '1', name: 'Coffee' }, { id: '10', name: 'Coffee' }, { id: '2', name: 'Coffee' },
    ]);
  });

  it('returns an empty array for no docs', () => {
    expect(listCategories([], wooProductTraits)).toEqual([]);
  });

  it('reads Medusa categories through its traits', () => {
    const docs = [{ id: 'p1', title: 'Machine', categories: [{ id: 'pcat_01', name: 'Equipment' }] }];
    expect(listCategories(docs, medusaProductTraits)).toEqual([{ id: 'pcat_01', name: 'Equipment' }]);
  });
});

describe('inCategory', () => {
  const doc = { id: 1, name: 'Beans', categories: [{ id: 1, name: 'Coffee' }] };

  it('matches the string id of a numeric Woo category id', () => {
    expect(inCategory(doc, '1', wooProductTraits)).toBe(true);
  });

  it('returns false for an absent category id', () => {
    expect(inCategory(doc, '2', wooProductTraits)).toBe(false);
  });
});

describe('productCategories fallback', () => {
  it('uses category names as ids when getCategories is absent', () => {
    const traits = { ...wooProductTraits, getCategories: undefined };
    const doc = { id: 1, name: 'Beans', categories: [
      { id: 1, name: 'Coffee' }, { id: 2, name: 'Equipment' },
    ] };
    expect(productCategories(doc, traits)).toEqual([
      { id: 'Coffee', name: 'Coffee' }, { id: 'Equipment', name: 'Equipment' },
    ]);
    expect(inCategory(doc, 'Coffee', traits)).toBe(true);
  });
});

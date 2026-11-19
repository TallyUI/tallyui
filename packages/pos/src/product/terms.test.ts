import { describe, it, expect } from 'vitest';
import type { ProductTerm, ProductTraits } from '@tallyui/core';
import { wooProductTraits } from '@tallyui/connector-woocommerce';
import { productTerms, listTermGroups, hasTerm } from './terms';

interface Doc { id: number; name: string; terms: ProductTerm[] }

const traits = { ...wooProductTraits, getTerms: (doc: Doc) => doc.terms } as unknown as ProductTraits<Doc>;

const term = (group: string, groupName: string, id: string, name: string): ProductTerm => ({ group, groupName, id, name });

describe('productTerms and listTermGroups without getTerms', () => {
  it('gives no terms and no groups', () => {
    const docs = [{ id: 1, name: 'Beans', categories: [{ id: 1, name: 'Coffee' }] }];
    expect(productTerms(docs[0], wooProductTraits)).toEqual([]);
    expect(listTermGroups(docs, wooProductTraits)).toEqual([]);
  });
});

describe('listTermGroups', () => {
  it('lists each group and each term once across three docs, sorted by name', () => {
    const docs: Doc[] = [
      { id: 1, name: 'Beans', terms: [term('b', 'Brand', '1', 'Acme')] },
      { id: 2, name: 'Grinder', terms: [term('b', 'Brand', '1', 'Acme'), term('b', 'Brand', '2', 'Zeta')] },
      { id: 3, name: 'Mug', terms: [term('c', 'Colour', 'r', 'Red')] },
    ];
    expect(listTermGroups(docs, traits)).toEqual([
      { id: 'b', name: 'Brand', terms: [{ id: '1', name: 'Acme' }, { id: '2', name: 'Zeta' }] },
      { id: 'c', name: 'Colour', terms: [{ id: 'r', name: 'Red' }] },
    ]);
  });

  it('sorts term names naturally', () => {
    const docs: Doc[] = [{ id: 1, name: 'Shoe', terms: [
      term('s', 'Size', '10', 'Size 10'), term('s', 'Size', '9', 'Size 9'),
    ] }];
    expect(listTermGroups(docs, traits)).toEqual([
      { id: 's', name: 'Size', terms: [{ id: '9', name: 'Size 9' }, { id: '10', name: 'Size 10' }] },
    ]);
  });

  it('keeps the first name seen for a repeated group id and a repeated term id', () => {
    const docs: Doc[] = [
      { id: 1, name: 'Beans', terms: [term('b', 'Brand', '1', 'Acme')] },
      { id: 2, name: 'Grinder', terms: [term('b', 'Maker', '1', 'Acme Renamed')] },
    ];
    expect(listTermGroups(docs, traits)).toEqual([
      { id: 'b', name: 'Brand', terms: [{ id: '1', name: 'Acme' }] },
    ]);
  });
});

describe('hasTerm', () => {
  const doc: Doc = { id: 1, name: 'Beans', terms: [term('b', 'Brand', '1', 'Acme')] };

  it('is true for the right group and id', () => {
    expect(hasTerm(doc, 'b', '1', traits)).toBe(true);
  });

  it('is false for the same id under another group', () => {
    expect(hasTerm(doc, 'c', '1', traits)).toBe(false);
  });
});

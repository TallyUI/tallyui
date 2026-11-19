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
    const noTerms = { ...wooProductTraits, getTerms: undefined } as unknown as ProductTraits<(typeof docs)[number]>;
    expect(productTerms(docs[0], noTerms)).toEqual([]);
    expect(listTermGroups(docs, noTerms)).toEqual([]);
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

  it('sorts groups by name', () => {
    const docs: Doc[] = [
      { id: 1, name: 'Mug', terms: [term('c', 'Colour', '1', 'Red')] },
      { id: 2, name: 'Beans', terms: [term('b', 'Brand', '9', 'Acme')] },
    ];
    expect(listTermGroups(docs, traits).map((g) => g.id)).toEqual(['b', 'c']);
  });

  it('ignores case and orders equal names by string id', () => {
    const docs: Doc[] = [{ id: 1, name: 'Product', terms: [
      term('g', 'G', '2', 'Red'), term('g', 'G', '10', 'Red'), term('g', 'G', '5', 'red'),
      term('g', 'G', '3', 'apple'), term('g', 'G', '1', 'Banana'),
    ] }];
    // apple < Banana < Red = Red = red (case ignored); the three ties by string id: '10' < '2' < '5'.
    expect(listTermGroups(docs, traits)[0].terms.map((t) => t.id)).toEqual(['3', '1', '10', '2', '5']);
  });

  it('keeps the same term id in each group that has it', () => {
    const docs: Doc[] = [{ id: 1, name: 'Mug', terms: [
      term('b', 'Brand', '1', 'Acme'), term('c', 'Colour', '1', 'Red'),
    ] }];
    expect(listTermGroups(docs, traits)).toEqual([
      { id: 'b', name: 'Brand', terms: [{ id: '1', name: 'Acme' }] },
      { id: 'c', name: 'Colour', terms: [{ id: '1', name: 'Red' }] },
    ]);
  });

  it('handles a product with no terms beside one with terms', () => {
    const docs: Doc[] = [
      { id: 1, name: 'Plain', terms: [] },
      { id: 2, name: 'Beans', terms: [term('b', 'Brand', '1', 'Acme')] },
    ];
    expect(productTerms(docs[0], traits)).toEqual([]);
    expect(listTermGroups(docs, traits)).toEqual([
      { id: 'b', name: 'Brand', terms: [{ id: '1', name: 'Acme' }] },
    ]);
    expect(hasTerm(docs[0], 'b', '1', traits)).toBe(false);
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

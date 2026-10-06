import { describe, expect, it, vi } from 'vitest';
import type { ProductTraits } from '@tallyui/core';
import { medusaConnector } from '@tallyui/connector-medusa';
import { catalogueEntries, findEntryByCode, variantPriceLabel } from './catalogue';

const traits = medusaConnector.traits.product;
const products = [
  { id: 'shirt', title: 'Shirt', status: 'published', variants: [
    { id: 'small', title: 'Small', sku: 'COLLISION', barcode: '111',
      prices: [{ amount: 20, currency_code: 'eur' }],
      calculated_price: { currency_code: 'eur', calculated_amount: 12.5, original_amount: 20,
        calculated_price: { price_list_type: 'sale' } } },
    { id: 'large', title: 'Large', sku: ' LARGE ', barcode: '222', prices: [] },
  ] },
  { id: 'hat', title: 'Hat', status: 'published', variants: [
    { id: 'hat-one', title: 'One size', sku: 'HAT', barcode: ' collision ', prices: [] },
  ] },
];

describe('catalogue helpers', () => {
  const entries = catalogueEntries(products, traits);
  it('enumerates products and their variants in order through traits', () => {
    expect(entries).toEqual(products.flatMap((product) =>
      traits.getVariants!(product).map((variant) => ({ product, variant }))));
    expect(entries.map(({ variant }) => variant.id)).toEqual(['small', 'large', 'hat-one']);
    expect(catalogueEntries([], traits)).toEqual([]);
  });
  it('passes context to getVariants and preserves the returned variants', () => {
    const variants = products.map((product) => traits.getVariants!(product));
    const getVariants = vi.fn(traits.getVariants!).mockReturnValueOnce(variants[0]).mockReturnValueOnce(variants[1]);
    const context = { currency: 'EUR' };
    const actual = catalogueEntries(products, { ...traits, getVariants }, context);
    expect(getVariants.mock.calls).toEqual(products.map((product) => [product, context]));
    expect(actual).toEqual(products.flatMap((product, i) => variants[i].map((variant) => ({ product, variant }))));
    actual.forEach((entry, i) => expect(entry.variant).toBe(variants.flat()[i]));
  });
  it('prefers a barcode over a SKU in another product', () => {
    expect(findEntryByCode(entries, 'COLLISION')).toBe(entries[2]);
  });
  it('ignores case and surrounding whitespace for barcode and SKU', () => {
    expect(findEntryByCode(entries, '  CoLlIsIoN  ')).toBe(entries[2]);
    expect(findEntryByCode(entries, ' large ')).toBe(entries[1]);
  });
  it.each(['', '   ', 'missing'])('returns undefined for %j', (code) => {
    expect(findEntryByCode(entries, code)).toBeUndefined();
  });
  it('formats the resolved EUR sale price in minor units', () => {
    expect(variantPriceLabel(entries[0].variant, 'EUR', 'en-IE')).toBe('€12.50');
  });
  it('omits a price when the requested currency is absent', () => {
    expect(variantPriceLabel(entries[0].variant, 'USD', 'en-US')).toBeUndefined();
    expect(variantPriceLabel(entries[1].variant, 'EUR', 'en-IE')).toBeUndefined();
  });
});

describe('catalogue entries without getVariants', () => {
  const simpleProducts = [
    { id: 'one', sku: 'ONE', barcode: '111', amount: 100, quantity: 2 },
    { id: 'two', sku: 'TWO', barcode: '222', amount: 200, quantity: 0 },
  ];
  const simpleTraits: ProductTraits<(typeof simpleProducts)[number]> = {
    ...traits, getVariants: undefined,
    getId: (doc) => doc.id, getSku: (doc) => doc.sku, getBarcode: (doc) => doc.barcode,
    getPrices: (doc, context) => [{ amount: doc.amount, currency: context?.currency ?? 'XXX', kind: 'base' }],
    getStock: (doc) => ({ status: doc.quantity ? 'in_stock' : 'out_of_stock', quantity: doc.quantity }),
    hasVariants: (doc) => doc.id === 'variable',
  };

  it('builds one entry per simple product from its traits, using the context currency', () => {
    expect(catalogueEntries(simpleProducts, simpleTraits, { currency: 'EUR' })).toEqual([
      { product: simpleProducts[0], variant: { id: 'one', sku: 'ONE', barcode: '111',
        prices: [{ amount: 100, currency: 'EUR', kind: 'base' }], stock: { status: 'in_stock', quantity: 2 } } },
      { product: simpleProducts[1], variant: { id: 'two', sku: 'TWO', barcode: '222',
        prices: [{ amount: 200, currency: 'EUR', kind: 'base' }], stock: { status: 'out_of_stock', quantity: 0 } } },
    ]);
  });

  it('omits products that have variants', () => {
    expect(catalogueEntries([{ ...simpleProducts[0], id: 'variable' }], simpleTraits)).toEqual([]);
  });
});

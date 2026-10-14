import { describe, expect, it, vi } from 'vitest';
import { medusaConnector } from '@tallyui/connector-medusa';
import { createOrderBuilder } from '../order';
import { catalogueEntries } from './catalogue';
import { addEntryToCart, CartError } from './cart';

const traits = medusaConnector.traits.product;
const product = {
  id: 'shirt', title: 'Shirt', thumbnail: 'https://store.test/shirt.jpg',
  variants: [{ id: 'small', title: 'Small', sku: 'SHIRT-S', prices: [{ amount: 10, currency_code: 'eur' }] }],
};
const entry = catalogueEntries([product], traits)[0];
function orderBuilder() {
  return createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 190000, pricesIncludeTax: false } });
}

describe('addEntryToCart', () => {
  it.each([false, true])('stores the regular price of a variant, on sale: %s', (onSale) => {
    const builder = orderBuilder();
    const variant = { ...entry.variant, prices: [
      { amount: 1000, currency: 'EUR', kind: 'base' as const },
      ...(onSale ? [{ amount: 800, currency: 'EUR', kind: 'sale' as const }] : []),
    ] };
    addEntryToCart(builder, { ...entry, variant }, traits, 'EUR');
    expect(builder.getSnapshot().lineItems[0]).toMatchObject({
      unitPriceMinor: onSale ? 800 : 1000, regularUnitPriceMinor: 1000,
    });
  });

  it('passes the selected variant tax exemption to the line', () => {
    const builder = orderBuilder();
    const addLine = vi.spyOn(builder, 'addLine');
    const getTaxStatus = vi.fn(() => 'none' as const);
    addEntryToCart(builder, entry, { ...traits, getTaxStatus }, 'EUR');
    expect(getTaxStatus).toHaveBeenCalledWith(product, 'small');
    expect(addLine.mock.calls[0][0]).toHaveProperty('taxStatus', 'none');
    expect(builder.getSnapshot().lineItems[0]).toHaveProperty('taxStatus', 'none');
  });

  it.each([
    { label: 'absent', getTaxStatus: undefined },
    { label: 'taxable', getTaxStatus: () => 'taxable' as const },
    { label: 'undefined', getTaxStatus: () => undefined },
  ])('omits the taxStatus key when the trait is $label', ({ getTaxStatus }) => {
    const builder = orderBuilder();
    const addLine = vi.spyOn(builder, 'addLine');
    addEntryToCart(builder, entry, { ...traits, ...(getTaxStatus ? { getTaxStatus } : {}) }, 'EUR');
    expect(addLine.mock.calls[0][0]).not.toHaveProperty('taxStatus');
    expect(builder.getSnapshot().lineItems[0]).not.toHaveProperty('taxStatus');
  });

  it('adds the selected variant with the product fields and integer minor-unit price', () => {
    const builder = orderBuilder();
    const id = addEntryToCart(builder, entry, traits, 'EUR');
    expect(builder.getSnapshot().lineItems).toHaveLength(1);
    expect(builder.getSnapshot().lineItems[0]).toMatchObject({
      id, productId: 'shirt', variantId: 'small', name: 'Shirt', sku: 'SHIRT-S',
      imageUrl: product.thumbnail, unitPriceMinor: 1000, quantity: 1,
    });
  });
  it('increments the same line and lets TallyUI compute 2 × EUR 10 at 19% exclusive', () => {
    const builder = orderBuilder();
    const id = addEntryToCart(builder, entry, traits, 'EUR');
    expect(addEntryToCart(builder, entry, traits, 'EUR')).toBe(id);
    const order = builder.getSnapshot();
    expect(order.lineItems).toHaveLength(1);
    expect(order.lineItems[0].quantity).toBe(2);
    expect(order.totalMinor).toBe(2380);
  });
  it('increments by variant id even if the catalogue price changes', () => {
    const builder = orderBuilder();
    const id = addEntryToCart(builder, entry, traits, 'EUR');
    const changed = { ...product, variants: [{ ...product.variants[0], prices: [{ amount: 12, currency_code: 'eur' }] }] };
    expect(addEntryToCart(builder, catalogueEntries([changed], traits)[0], traits, 'EUR')).toBe(id);
    expect(builder.getSnapshot().lineItems).toHaveLength(1);
    expect(builder.getSnapshot().lineItems[0]).toMatchObject({ quantity: 2, unitPriceMinor: 1000 });
  });
  it('uses the selected variant price and title for a multi-variant product', () => {
    const multi = { ...product, variants: [...product.variants,
      { id: 'large', title: 'Large', sku: 'SHIRT-L', prices: [{ amount: 15, currency_code: 'eur' }] },
    ] };
    const builder = orderBuilder();
    const entries = catalogueEntries([multi], traits);
    addEntryToCart(builder, entries[0], traits, 'EUR');
    addEntryToCart(builder, entries[1], traits, 'EUR');
    expect(builder.getSnapshot().lineItems).toMatchObject([
      { variantId: 'small', name: 'Shirt · Small', unitPriceMinor: 1000 },
      { variantId: 'large', name: 'Shirt · Large', unitPriceMinor: 1500 },
    ]);
  });
  it("keeps the variant's options as line attributes and leaves the name alone", () => {
    const builder = orderBuilder();
    addEntryToCart(builder, { ...entry, variant: { ...entry.variant, options: { Size: 'M', Color: 'Black' } } }, traits, 'EUR');
    expect(builder.getSnapshot().lineItems[0]).toMatchObject({ name: 'Shirt', attributes: { Size: 'M', Color: 'Black' } });
  });
  it.each([undefined, {}])('adds no attributes key when the options are %s', (options) => {
    const builder = orderBuilder();
    addEntryToCart(builder, { ...entry, variant: { ...entry.variant, options } }, traits, 'EUR');
    expect(builder.getSnapshot().lineItems[0]).not.toHaveProperty('attributes');
    expect(builder.getSnapshot().lineItems[0].name).toBe('Shirt');
  });
  it('uses an empty SKU when the selected variant has none', () => {
    const noSku = { ...product, variants: [{ id: 'plain', prices: [{ amount: 10, currency_code: 'eur' }] }] };
    const builder = orderBuilder();
    addEntryToCart(builder, catalogueEntries([noSku], traits)[0], traits, 'EUR');
    expect(builder.getSnapshot().lineItems[0].sku).toBe('');
  });
  it('throws CartError with the currency and product name when there is no EUR price', () => {
    const unpriced = { ...product, variants: [{ ...product.variants[0], prices: [{ amount: 10, currency_code: 'usd' }] }] };
    const builder = orderBuilder();
    const add = () => addEntryToCart(builder, catalogueEntries([unpriced], traits)[0], traits, 'EUR');
    expect(add).toThrow(CartError);
    expect(add).toThrow('No EUR price for Shirt');
    expect(builder.getSnapshot().lineItems).toHaveLength(0);
  });
});

describe('addEntryToCart with Any picks (#495)', () => {
  const groups = [{ id: '1', name: 'Size', values: ['S', 'M'] }, { name: 'Colour', values: ['Black', 'Red'] },
    { name: 'Logo', values: ['Cat', 'Dog'] }, { name: 'Lace', values: ['Flat', 'Round'] }];
  const anyTraits = { ...traits, getVariantOptions: () => groups };
  const picked = (picks: Record<string, string>) => ({ ...entry, variant: { ...entry.variant, options: { Colour: 'Black' } }, picks });

  it('puts the picks in attributes and their names in anyAttributes, in group order', () => {
    const builder = orderBuilder();
    addEntryToCart(builder, picked({ Lace: 'Round', Logo: 'Cat' }), anyTraits, 'EUR');
    const [line] = builder.getSnapshot().lineItems;
    expect(Object.entries(line.attributes!)).toEqual([['Colour', 'Black'], ['Logo', 'Cat'], ['Lace', 'Round']]);
    expect(line.anyAttributes).toEqual(['Logo', 'Lace']);
  });

  it.each([
    [{ Colour: 'Red' }, 'Colour is not an option to choose for this item'],
    [{ Size: 'S' }, 'Size is not an option to choose for this item'],
    [{ Engraving: 'Yes' }, 'Engraving is not an option to choose for this item'],
    [{ Logo: 'Fish' }, 'Fish is not a choice for Logo'],
    [{ Logo: '' }, ' is not a choice for Logo'],
  ])('refuses the pick %j', (picks, message) => {
    const builder = orderBuilder();
    expect(() => addEntryToCart(builder, picked(picks), anyTraits, 'EUR')).toThrow(message);
    expect(() => addEntryToCart(builder, picked(picks), anyTraits, 'EUR')).toThrow(CartError);
    expect(builder.getSnapshot().lineItems).toHaveLength(0);
  });

  it('merges the same picks only, and keeps a picked and an unpicked line of the variant apart', () => {
    const builder = orderBuilder();
    const plain = addEntryToCart(builder, picked({}), anyTraits, 'EUR');
    const cat = addEntryToCart(builder, picked({ Logo: 'Cat' }), anyTraits, 'EUR');
    expect(cat).not.toBe(plain);
    expect(addEntryToCart(builder, picked({ Logo: 'Cat' }), anyTraits, 'EUR')).toBe(cat);
    addEntryToCart(builder, picked({ Logo: 'Dog' }), anyTraits, 'EUR');
    expect(addEntryToCart(builder, picked({}), anyTraits, 'EUR')).toBe(plain);
    expect(builder.getSnapshot().lineItems.map((line) => [line.attributes, line.anyAttributes, line.quantity])).toEqual([
      [{ Colour: 'Black' }, undefined, 2], [{ Colour: 'Black', Logo: 'Cat' }, ['Logo'], 2], [{ Colour: 'Black', Logo: 'Dog' }, ['Logo'], 1],
    ]);
  });
});

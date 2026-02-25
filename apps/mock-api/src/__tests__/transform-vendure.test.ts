import { describe, it, expect } from 'vitest';
import { vendureProductTraits } from '@tallyui/connector-vendure';
import { toVendureProduct } from '../transforms/vendure';
import { products } from '../data/catalog';

describe('toVendureProduct', () => {
  const neutral = products[0]; // Espresso Machine Pro
  const vendure = toVendureProduct(neutral);

  it('getName returns doc.name (same field)', () => {
    expect(vendure.name).toBe(neutral.name);
    expect(vendureProductTraits.getName(vendure)).toBe(neutral.name);
  });

  it('slug maps correctly', () => {
    expect(vendure.slug).toBe(neutral.slug);
  });

  it('priceWithTax as integer cents on variant', () => {
    // Espresso Machine: 129900 cents
    expect(vendure.variants[0].priceWithTax).toBe(129900);
    expect(typeof vendure.variants[0].priceWithTax).toBe('number');
  });

  it('getPrice returns decimal string via trait', () => {
    // 129900 cents -> "1299.00"
    expect(vendureProductTraits.getPrice(vendure)).toBe('1299.00');
  });

  it('featuredAsset.preview for primary image', () => {
    expect(vendure.featuredAsset).not.toBeNull();
    expect(vendure.featuredAsset!.preview).toBe(neutral.images[0].url);
    expect(vendureProductTraits.getImageUrl(vendure)).toBe(neutral.images[0].url);
  });

  it('assets[].preview for all images', () => {
    expect(vendure.assets.length).toBe(neutral.images.length);
    expect(vendure.assets[0].preview).toBe(neutral.images[0].url);
    expect(vendureProductTraits.getImageUrls(vendure)).toEqual(
      neutral.images.map((img) => img.url),
    );
  });

  it('collections (Vendure categories)', () => {
    expect(vendure.collections.length).toBe(neutral.categories.length);
    expect(vendure.collections[0].name).toBe('Equipment');
    expect(vendureProductTraits.getCategoryNames(vendure)).toEqual(
      neutral.categories.map((c) => c.name),
    );
  });

  it('SKU on variant', () => {
    expect(vendure.variants[0].sku).toBe(neutral.variants[0].sku);
    expect(vendureProductTraits.getSku(vendure)).toBe('EQ-ESP-001');
  });

  it('barcode in customFields', () => {
    expect(vendure.variants[0].customFields.barcode).toBe(neutral.variants[0].barcode);
    expect(vendureProductTraits.getBarcode(vendure)).toBe('8901234560001');
  });

  it('stockLevel as SCREAMING_SNAKE_CASE (IN_STOCK)', () => {
    expect(vendure.variants[0].stockLevel).toBe('IN_STOCK');
    expect(vendureProductTraits.getStockStatus(vendure)).toBe('instock');
  });

  it('stockLevel OUT_OF_STOCK for out-of-stock product', () => {
    const oos = products.find((p) => p.id === 'prod-milk-frother')!;
    const vendureOos = toVendureProduct(oos);
    expect(vendureOos.variants[0].stockLevel).toBe('OUT_OF_STOCK');
    expect(vendureProductTraits.getStockStatus(vendureOos)).toBe('outofstock');
  });

  it('stockOnHand maps from stockQuantity', () => {
    expect(vendure.variants[0].stockOnHand).toBe(neutral.variants[0].stockQuantity);
    expect(vendureProductTraits.getStockQuantity(vendure)).toBe(12);
  });

  it('enabled boolean', () => {
    expect(vendure.enabled).toBe(true);
    expect(typeof vendure.enabled).toBe('boolean');
  });

  it('multi-variant hasVariants', () => {
    // Travel Tumbler has 4 variants
    const multiNeutral = products.find((p) => p.id === 'prod-travel-tumbler')!;
    const vendureMulti = toVendureProduct(multiNeutral);
    expect(vendureMulti.variants.length).toBe(4);
    expect(vendureProductTraits.hasVariants(vendureMulti)).toBe(true);
    expect(vendureProductTraits.getType(vendureMulti)).toBe('variable');
  });

  it('single-variant hasVariants returns false', () => {
    expect(vendureProductTraits.hasVariants(vendure)).toBe(false);
    expect(vendureProductTraits.getType(vendure)).toBe('simple');
  });

  it('getId returns string id (prod- prefix stripped)', () => {
    expect(vendureProductTraits.getId(vendure)).toBe('espresso-machine');
  });

  it('description as plain text', () => {
    expect(vendure.description).toBe(neutral.description);
    expect(vendureProductTraits.getDescription(vendure)).toBe(neutral.description);
  });

  it('updatedAt as camelCase ISO string', () => {
    expect(vendure.updatedAt).toBe(neutral.updatedAt);
  });

  it('isOnSale always returns false (Vendure handles sales via promotions)', () => {
    expect(vendureProductTraits.isOnSale(vendure)).toBe(false);
    expect(vendureProductTraits.getSalePrice(vendure)).toBeUndefined();
  });

  it('getRegularPrice matches getPrice (no sale concept)', () => {
    expect(vendureProductTraits.getRegularPrice(vendure)).toBe(
      vendureProductTraits.getPrice(vendure),
    );
  });

  it('handles product with no images', () => {
    const noImg = products.find((p) => p.images.length === 0)!;
    const vendureNoImg = toVendureProduct(noImg);
    expect(vendureNoImg.featuredAsset).toBeNull();
    expect(vendureNoImg.assets).toEqual([]);
    expect(vendureProductTraits.getImageUrl(vendureNoImg)).toBeUndefined();
    expect(vendureProductTraits.getImageUrls(vendureNoImg)).toEqual([]);
  });

  it('variant options mapped as { id, name, code }', () => {
    // Travel Tumbler first variant: { Size: '12 oz', Color: 'Black' }
    const multiNeutral = products.find((p) => p.id === 'prod-travel-tumbler')!;
    const vendureMulti = toVendureProduct(multiNeutral);
    const firstVariant = vendureMulti.variants[0];
    expect(firstVariant.options.length).toBe(2);
    expect(firstVariant.options[0].name).toBe('12 oz');
    expect(firstVariant.options[1].name).toBe('Black');
  });

  it('trackInventory as string TRUE/FALSE', () => {
    // Espresso Machine: trackInventory=true
    expect(vendure.variants[0].trackInventory).toBe('TRUE');

    // Espresso Shot: trackInventory=false
    const drink = products.find((p) => p.id === 'prod-espresso-shot')!;
    const vendureDrink = toVendureProduct(drink);
    expect(vendureDrink.variants[0].trackInventory).toBe('FALSE');
  });

  it('currencyCode is USD', () => {
    expect(vendure.variants[0].currencyCode).toBe('USD');
  });

  it('facetValues from tags', () => {
    // Espresso Machine Pro tags: Coffee, Best Seller
    expect(vendure.facetValues.length).toBe(2);
    expect(vendure.facetValues[0].name).toBe('Coffee');
    expect(vendure.facetValues[1].name).toBe('Best Seller');
  });

  it('variant has both priceWithTax and price (excl. tax)', () => {
    // priceWithTax is the full price, price is ~90%
    expect(vendure.variants[0].priceWithTax).toBe(129900);
    expect(vendure.variants[0].price).toBe(Math.round(129900 * 0.9));
  });

  it('handles product with no tags', () => {
    const noTags = products.find((p) => p.tags.length === 0)!;
    const vendureNoTags = toVendureProduct(noTags);
    expect(vendureNoTags.facetValues).toEqual([]);
  });

  it('barcode null when not present', () => {
    // Espresso Shot has no barcode
    const drink = products.find((p) => p.id === 'prod-espresso-shot')!;
    const vendureDrink = toVendureProduct(drink);
    expect(vendureDrink.variants[0].customFields.barcode).toBeNull();
    expect(vendureProductTraits.getBarcode(vendureDrink)).toBeUndefined();
  });
});

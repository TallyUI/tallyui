import { describe, it, expect } from 'vitest';
import { medusaProductTraits } from '@tallyui/connector-medusa';
import { toMedusaProduct } from '../transforms/medusa';
import { products } from '../data/catalog';

describe('toMedusaProduct', () => {
  const neutral = products[0]; // Espresso Machine Pro
  const medusa = toMedusaProduct(neutral);

  it('getName returns doc.title (not name)', () => {
    expect(medusa.title).toBe(neutral.name);
    expect(medusaProductTraits.getName(medusa)).toBe(neutral.name);
    // Medusa uses 'title', not 'name'
    expect((medusa as any).name).toBeUndefined();
  });

  it('handle maps from slug', () => {
    expect(medusa.handle).toBe(neutral.slug);
  });

  it('price is stored as integer cents on variants[0].prices[0].amount', () => {
    expect(medusa.variants[0].prices[0].amount).toBe(129900);
    expect(typeof medusa.variants[0].prices[0].amount).toBe('number');
    // Must be an integer, not a float
    expect(Number.isInteger(medusa.variants[0].prices[0].amount)).toBe(true);
  });

  it('getPrice returns decimal string via trait', () => {
    expect(medusaProductTraits.getPrice(medusa)).toBe('1299.00');
  });

  it('images use .url field', () => {
    expect(medusa.images[0].url).toBe(neutral.images[0].url);
    expect((medusa.images[0] as any).src).toBeUndefined();
  });

  it('thumbnail comes from first image', () => {
    expect(medusa.thumbnail).toBe(neutral.images[0].url);
    expect(medusaProductTraits.getImageUrl(medusa)).toBe(neutral.images[0].url);
  });

  it('getImageUrls returns all images deduped with thumbnail first', () => {
    const urls = medusaProductTraits.getImageUrls(medusa);
    expect(urls[0]).toBe(medusa.thumbnail);
    // Should include all image URLs (thumbnail + others)
    expect(urls.length).toBe(neutral.images.length);
  });

  it('SKU on variant', () => {
    expect(medusa.variants[0].sku).toBe(neutral.variants[0].sku);
    expect(medusaProductTraits.getSku(medusa)).toBe('EQ-ESP-001');
  });

  it('barcode on variant', () => {
    expect(medusa.variants[0].barcode).toBe(neutral.variants[0].barcode);
    expect(medusaProductTraits.getBarcode(medusa)).toBe('8901234560001');
  });

  it('categories include handle', () => {
    expect(medusa.categories[0].handle).toBe(neutral.categories[0].slug);
    expect(medusa.categories[0].name).toBe(neutral.categories[0].name);
    expect(medusaProductTraits.getCategoryNames(medusa)).toEqual(
      neutral.categories.map((c) => c.name)
    );
  });

  it('tags use value (not name)', () => {
    expect(medusa.tags[0].value).toBe(neutral.tags[0].name);
    expect((medusa.tags[0] as any).name).toBeUndefined();
  });

  it('id is prefixed with prod_', () => {
    expect(medusa.id).toMatch(/^prod_/);
    expect(medusaProductTraits.getId(medusa)).toBe(medusa.id);
  });

  it('maps description', () => {
    expect(medusaProductTraits.getDescription(medusa)).toBe(neutral.description);
  });

  it('maps stock status for tracked inventory', () => {
    // Espresso Machine: trackInventory=true, stockQuantity=12
    expect(medusa.variants[0].manage_inventory).toBe(true);
    expect(medusa.variants[0].inventory_quantity).toBe(12);
    expect(medusaProductTraits.getStockStatus(medusa)).toBe('instock');
    expect(medusaProductTraits.getStockQuantity(medusa)).toBe(12);
  });

  it('maps stock status for untracked inventory (drinks)', () => {
    const drink = products.find((p) => p.id === 'prod-espresso-shot')!;
    const medusaDrink = toMedusaProduct(drink);
    expect(medusaDrink.variants[0].manage_inventory).toBe(false);
    expect(medusaProductTraits.getStockStatus(medusaDrink)).toBe('instock');
  });

  it('maps out-of-stock correctly', () => {
    const oos = products.find((p) => p.id === 'prod-milk-frother')!;
    const medusaOos = toMedusaProduct(oos);
    expect(medusaOos.variants[0].inventory_quantity).toBe(0);
    expect(medusaProductTraits.getStockStatus(medusaOos)).toBe('outofstock');
  });

  it('maps created_at and updated_at', () => {
    expect(medusa.created_at).toBe(neutral.createdAt);
    expect(medusa.updated_at).toBe(neutral.updatedAt);
  });

  it('maps is_giftcard for gift card products', () => {
    const gc = products.find((p) => p.type === 'giftcard')!;
    const medusaGc = toMedusaProduct(gc);
    expect(medusaGc.is_giftcard).toBe(true);
    expect(medusaProductTraits.getType(medusaGc)).toBe('giftcard');
  });

  describe('multi-variant product', () => {
    const multiVariant = products.find((p) => p.id === 'prod-ethiopian-yirgacheffe')!;
    const medusaMulti = toMedusaProduct(multiVariant);

    it('has correct variant count', () => {
      expect(medusaMulti.variants.length).toBe(3);
    });

    it('hasVariants returns true', () => {
      expect(medusaProductTraits.hasVariants(medusaMulti)).toBe(true);
    });

    it('getType returns variable', () => {
      expect(medusaProductTraits.getType(medusaMulti)).toBe('variable');
    });

    it('getPrice returns first variant price as decimal', () => {
      // Ethiopian Yirgacheffe 250g = 1800 cents = "18.00"
      expect(medusaProductTraits.getPrice(medusaMulti)).toBe('18.00');
    });
  });

  it('handles product with no images', () => {
    const noImg = products.find((p) => p.images.length === 0)!;
    const medusaNoImg = toMedusaProduct(noImg);
    expect(medusaNoImg.images).toEqual([]);
    expect(medusaNoImg.thumbnail).toBeNull();
    expect(medusaProductTraits.getImageUrl(medusaNoImg)).toBeUndefined();
  });

  it('handles product with no tags', () => {
    const noTags = products.find((p) => p.tags.length === 0)!;
    const medusaNoTags = toMedusaProduct(noTags);
    expect(medusaNoTags.tags).toEqual([]);
  });
});

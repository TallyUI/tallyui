import { describe, it, expect } from 'vitest';
import { shopifyProductTraits } from '@tallyui/connector-shopify';
import { toShopifyProduct } from '../transforms/shopify';
import { products } from '../data/catalog';

describe('toShopifyProduct', () => {
  const neutral = products[0]; // Espresso Machine Pro
  const shopify = toShopifyProduct(neutral);

  it('getName returns doc.title', () => {
    expect(shopify.title).toBe(neutral.name);
    expect(shopifyProductTraits.getName(shopify)).toBe(neutral.name);
    // Shopify uses 'title', not 'name'
    expect((shopify as any).name).toBeUndefined();
  });

  it('price as decimal string on variant', () => {
    // Espresso Machine: 129900 cents -> "1299.00"
    expect(shopify.variants[0].price).toBe('1299.00');
    expect(shopifyProductTraits.getPrice(shopify)).toBe('1299.00');
  });

  it('images use .src field', () => {
    expect(shopify.images[0].src).toBe(neutral.images[0].url);
    expect((shopify.images[0] as any).url).toBeUndefined();
    expect(shopifyProductTraits.getImageUrls(shopify)).toEqual(
      neutral.images.map((img) => img.url)
    );
  });

  it('image shortcut (doc.image.src)', () => {
    expect(shopify.image).not.toBeNull();
    expect(shopify.image!.src).toBe(neutral.images[0].url);
    expect(shopifyProductTraits.getImageUrl(shopify)).toBe(neutral.images[0].url);
  });

  it('SKU on variant', () => {
    expect(shopify.variants[0].sku).toBe(neutral.variants[0].sku);
    expect(shopifyProductTraits.getSku(shopify)).toBe('EQ-ESP-001');
  });

  it('barcode on variant', () => {
    expect(shopify.variants[0].barcode).toBe(neutral.variants[0].barcode);
    expect(shopifyProductTraits.getBarcode(shopify)).toBe('8901234560001');
  });

  it('tags as comma-separated string', () => {
    // Espresso Machine Pro tags: Coffee, Best Seller
    expect(shopify.tags).toBe('Coffee, Best Seller');
    expect(typeof shopify.tags).toBe('string');
  });

  it('product_type from first category', () => {
    // Espresso Machine Pro category: Equipment
    expect(shopify.product_type).toBe('Equipment');
    expect(shopifyProductTraits.getCategoryNames(shopify)).toEqual(['Equipment']);
  });

  it('compare_at_price for sale items + isOnSale', () => {
    // Burr Grinder: price=24900, compareAtPrice=29900
    const saleNeutral = products.find((p) => p.id === 'prod-burr-grinder')!;
    const shopifySale = toShopifyProduct(saleNeutral);

    expect(shopifySale.variants[0].price).toBe('249.00');
    expect(shopifySale.variants[0].compare_at_price).toBe('299.00');

    expect(shopifyProductTraits.isOnSale(shopifySale)).toBe(true);
    expect(shopifyProductTraits.getSalePrice(shopifySale)).toBe('249.00');
    expect(shopifyProductTraits.getRegularPrice(shopifySale)).toBe('299.00');
  });

  it('compare_at_price is null when not on sale', () => {
    expect(shopify.variants[0].compare_at_price).toBeNull();
    expect(shopifyProductTraits.isOnSale(shopify)).toBe(false);
    expect(shopifyProductTraits.getSalePrice(shopify)).toBeUndefined();
  });

  it('stock via inventory_management (tracked)', () => {
    // Espresso Machine: trackInventory=true, stockQuantity=12
    expect(shopify.variants[0].inventory_management).toBe('shopify');
    expect(shopify.variants[0].inventory_quantity).toBe(12);
    expect(shopifyProductTraits.getStockStatus(shopify)).toBe('instock');
    expect(shopifyProductTraits.getStockQuantity(shopify)).toBe(12);
  });

  it('stock via inventory_management (untracked)', () => {
    // Espresso Shot: trackInventory=false
    const drink = products.find((p) => p.id === 'prod-espresso-shot')!;
    const shopifyDrink = toShopifyProduct(drink);
    expect(shopifyDrink.variants[0].inventory_management).toBeNull();
    expect(shopifyProductTraits.getStockStatus(shopifyDrink)).toBe('instock');
  });

  it('stock for out-of-stock product', () => {
    // Milk Frother: stockQuantity=0, stockStatus='outofstock'
    const oos = products.find((p) => p.id === 'prod-milk-frother')!;
    const shopifyOos = toShopifyProduct(oos);
    expect(shopifyOos.variants[0].inventory_management).toBe('shopify');
    expect(shopifyOos.variants[0].inventory_policy).toBe('deny');
    expect(shopifyOos.variants[0].inventory_quantity).toBe(0);
    expect(shopifyProductTraits.getStockStatus(shopifyOos)).toBe('outofstock');
  });

  it('stock for backorder product', () => {
    // Reusable Filter: stockStatus='onbackorder'
    const bo = products.find((p) => p.id === 'prod-reusable-filter')!;
    const shopifyBo = toShopifyProduct(bo);
    expect(shopifyBo.variants[0].inventory_management).toBe('shopify');
    expect(shopifyBo.variants[0].inventory_policy).toBe('continue');
    expect(shopifyProductTraits.getStockStatus(shopifyBo)).toBe('onbackorder');
  });

  describe('multi-variant uses option1/option2/option3', () => {
    // Travel Tumbler has 2 option axes: Size and Color
    const multiNeutral = products.find((p) => p.id === 'prod-travel-tumbler')!;
    const shopifyMulti = toShopifyProduct(multiNeutral);

    it('has correct variant count', () => {
      expect(shopifyMulti.variants.length).toBe(4);
    });

    it('hasVariants returns true', () => {
      expect(shopifyProductTraits.hasVariants(shopifyMulti)).toBe(true);
    });

    it('maps option1 and option2 positionally', () => {
      // First variant: 12 oz / Black
      expect(shopifyMulti.variants[0].option1).toBe('12 oz');
      expect(shopifyMulti.variants[0].option2).toBe('Black');
      expect(shopifyMulti.variants[0].option3).toBeNull();

      // Last variant: 16 oz / Sage
      expect(shopifyMulti.variants[3].option1).toBe('16 oz');
      expect(shopifyMulti.variants[3].option2).toBe('Sage');
      expect(shopifyMulti.variants[3].option3).toBeNull();
    });

    it('single-option variant uses option1 only', () => {
      // Ethiopian Yirgacheffe: Size only
      const beansNeutral = products.find((p) => p.id === 'prod-ethiopian-yirgacheffe')!;
      const shopifyBeans = toShopifyProduct(beansNeutral);

      expect(shopifyBeans.variants[0].option1).toBe('250 g');
      expect(shopifyBeans.variants[0].option2).toBeNull();
      expect(shopifyBeans.variants[0].option3).toBeNull();
    });

    it('simple product has null for all options', () => {
      // Espresso Machine: no options
      expect(shopify.variants[0].option1).toBeNull();
      expect(shopify.variants[0].option2).toBeNull();
      expect(shopify.variants[0].option3).toBeNull();
    });
  });

  it('handle maps from slug', () => {
    expect(shopify.handle).toBe(neutral.slug);
  });

  it('maps description via body_html', () => {
    expect(shopify.body_html).toBe(`<p>${neutral.description}</p>`);
    expect(shopifyProductTraits.getDescription(shopify)).toBe(shopify.body_html);
  });

  it('getId returns string id', () => {
    expect(shopifyProductTraits.getId(shopify)).toBe(neutral.id);
  });

  it('maps updated_at', () => {
    expect(shopify.updated_at).toBe(neutral.updatedAt);
  });

  it('handles product with no images', () => {
    const noImg = products.find((p) => p.images.length === 0)!;
    const shopifyNoImg = toShopifyProduct(noImg);
    expect(shopifyNoImg.images).toEqual([]);
    expect(shopifyNoImg.image).toBeNull();
    expect(shopifyProductTraits.getImageUrl(shopifyNoImg)).toBeUndefined();
  });

  it('handles product with no tags', () => {
    const noTags = products.find((p) => p.tags.length === 0)!;
    const shopifyNoTags = toShopifyProduct(noTags);
    expect(shopifyNoTags.tags).toBe('');
  });

  it('getType returns product_type', () => {
    expect(shopifyProductTraits.getType(shopify)).toBe('Equipment');
  });
});

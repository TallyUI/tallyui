import { describe, it, expect } from 'vitest';
import { shopifyProductTraits } from '../traits/product';

/**
 * Realistic Shopify product document, shaped like the Admin REST API response.
 */
const fullProduct = {
  id: 7429873610823,
  title: 'Espresso Machine Pro',
  body_html: '<p>High-end espresso machine with dual boilers.</p>',
  vendor: 'BrewCraft',
  product_type: 'Equipment',
  handle: 'espresso-machine-pro',
  status: 'active',
  tags: 'coffee, equipment, pro-series',
  variants: [
    {
      id: 42304918372615,
      title: 'Silver',
      price: '599.99',
      compare_at_price: null,
      sku: 'ESP-PRO-SLV',
      barcode: '1234567890123',
      inventory_policy: 'deny',
      inventory_management: 'shopify',
      inventory_quantity: 15,
      option1: 'Silver',
    },
    {
      id: 42304918372616,
      title: 'Matte Black',
      price: '649.99',
      compare_at_price: '699.99',
      sku: 'ESP-PRO-BLK',
      barcode: '1234567890124',
      inventory_policy: 'deny',
      inventory_management: 'shopify',
      inventory_quantity: 3,
      option1: 'Matte Black',
    },
  ],
  options: [
    { id: 1, name: 'Color', position: 1, values: ['Silver', 'Matte Black'] },
  ],
  images: [
    { id: 1, src: 'https://cdn.shopify.com/espresso-front.jpg', alt: 'Front', position: 1 },
    { id: 2, src: 'https://cdn.shopify.com/espresso-black.jpg', alt: 'Black', position: 2 },
  ],
  image: {
    id: 1,
    src: 'https://cdn.shopify.com/espresso-front.jpg',
    alt: 'Front',
  },
};

/**
 * Single-variant product (no meaningful options).
 */
const simpleProduct = {
  id: 7429873610824,
  title: 'Coffee Mug',
  body_html: '<p>A simple ceramic mug.</p>',
  product_type: '',
  status: 'active',
  tags: '',
  variants: [
    {
      id: 42304918372617,
      title: 'Default Title',
      price: '14.99',
      compare_at_price: null,
      sku: 'MUG-001',
      barcode: null,
      inventory_policy: 'deny',
      inventory_management: null, // not tracking inventory
      inventory_quantity: 0,
    },
  ],
  options: [
    { id: 1, name: 'Title', position: 1, values: ['Default Title'] },
  ],
  images: [],
  image: null,
};

/**
 * Product with an active sale (compare_at_price > price).
 */
const saleProduct = {
  ...fullProduct,
  id: 7429873610825,
  variants: [
    {
      ...fullProduct.variants[0],
      price: '499.99',
      compare_at_price: '599.99',
    },
  ],
};

const minimalProduct = {
  id: 9999,
};

describe('Shopify product traits', () => {
  describe('getId', () => {
    it('returns the product id as a string', () => {
      expect(shopifyProductTraits.getId(fullProduct)).toBe('7429873610823');
    });
  });

  describe('getName', () => {
    it('returns the title', () => {
      expect(shopifyProductTraits.getName(fullProduct)).toBe('Espresso Machine Pro');
    });

    it('returns empty string for missing title', () => {
      expect(shopifyProductTraits.getName(minimalProduct)).toBe('');
    });
  });

  describe('getSku', () => {
    it('returns SKU from first variant', () => {
      expect(shopifyProductTraits.getSku(fullProduct)).toBe('ESP-PRO-SLV');
    });

    it('returns undefined when no variants', () => {
      expect(shopifyProductTraits.getSku(minimalProduct)).toBeUndefined();
    });
  });

  describe('getPrice', () => {
    it('returns price string from first variant', () => {
      expect(shopifyProductTraits.getPrice(fullProduct)).toBe('599.99');
    });

    it('returns undefined when no variants', () => {
      expect(shopifyProductTraits.getPrice(minimalProduct)).toBeUndefined();
    });
  });

  describe('getRegularPrice / getSalePrice / isOnSale', () => {
    it('regular price falls back to current price when no compare_at', () => {
      expect(shopifyProductTraits.getRegularPrice(fullProduct)).toBe('599.99');
    });

    it('not on sale when compare_at_price is null', () => {
      expect(shopifyProductTraits.isOnSale(fullProduct)).toBe(false);
      expect(shopifyProductTraits.getSalePrice(fullProduct)).toBeUndefined();
    });

    it('detects sale when compare_at_price > price', () => {
      expect(shopifyProductTraits.isOnSale(saleProduct)).toBe(true);
      expect(shopifyProductTraits.getSalePrice(saleProduct)).toBe('499.99');
      expect(shopifyProductTraits.getRegularPrice(saleProduct)).toBe('599.99');
    });
  });

  describe('getImageUrl / getImageUrls', () => {
    it('returns the primary image src via image shortcut', () => {
      expect(shopifyProductTraits.getImageUrl(fullProduct)).toBe(
        'https://cdn.shopify.com/espresso-front.jpg'
      );
    });

    it('returns all image URLs', () => {
      expect(shopifyProductTraits.getImageUrls(fullProduct)).toEqual([
        'https://cdn.shopify.com/espresso-front.jpg',
        'https://cdn.shopify.com/espresso-black.jpg',
      ]);
    });

    it('returns undefined / empty for product with no images', () => {
      expect(shopifyProductTraits.getImageUrl(simpleProduct)).toBeUndefined();
      expect(shopifyProductTraits.getImageUrls(simpleProduct)).toEqual([]);
    });
  });

  describe('getDescription', () => {
    it('returns body_html', () => {
      expect(shopifyProductTraits.getDescription(fullProduct)).toBe(
        '<p>High-end espresso machine with dual boilers.</p>'
      );
    });

    it('returns undefined when missing', () => {
      expect(shopifyProductTraits.getDescription(minimalProduct)).toBeUndefined();
    });
  });

  describe('getStockStatus', () => {
    it('returns instock for product with quantity', () => {
      expect(shopifyProductTraits.getStockStatus(fullProduct)).toBe('instock');
    });

    it('returns instock when inventory_management is null (not tracked)', () => {
      expect(shopifyProductTraits.getStockStatus(simpleProduct)).toBe('instock');
    });

    it('returns outofstock when tracked and quantity is 0', () => {
      const outOfStock = {
        ...fullProduct,
        variants: [{
          ...fullProduct.variants[0],
          inventory_quantity: 0,
        }],
      };
      expect(shopifyProductTraits.getStockStatus(outOfStock)).toBe('outofstock');
    });

    it('returns onbackorder when inventory_policy is continue', () => {
      const backorder = {
        ...fullProduct,
        variants: [{
          ...fullProduct.variants[0],
          inventory_policy: 'continue',
          inventory_quantity: 0,
        }],
      };
      expect(shopifyProductTraits.getStockStatus(backorder)).toBe('onbackorder');
    });

    it('returns unknown when no variants', () => {
      expect(shopifyProductTraits.getStockStatus(minimalProduct)).toBe('unknown');
    });
  });

  describe('getStockQuantity', () => {
    it('returns quantity from first variant', () => {
      expect(shopifyProductTraits.getStockQuantity(fullProduct)).toBe(15);
    });

    it('returns null when no variants', () => {
      expect(shopifyProductTraits.getStockQuantity(minimalProduct)).toBeNull();
    });
  });

  describe('hasVariants / getType', () => {
    it('multi-variant product has variants', () => {
      expect(shopifyProductTraits.hasVariants(fullProduct)).toBe(true);
    });

    it('single-variant product has no variants', () => {
      expect(shopifyProductTraits.hasVariants(simpleProduct)).toBe(false);
    });

    it('returns product_type', () => {
      expect(shopifyProductTraits.getType(fullProduct)).toBe('Equipment');
    });

    it('defaults to simple when product_type is empty', () => {
      expect(shopifyProductTraits.getType(simpleProduct)).toBe('simple');
    });
  });

  describe('getBarcode', () => {
    it('returns barcode from first variant', () => {
      expect(shopifyProductTraits.getBarcode(fullProduct)).toBe('1234567890123');
    });

    it('returns undefined when barcode is null', () => {
      expect(shopifyProductTraits.getBarcode(simpleProduct)).toBeUndefined();
    });
  });

  describe('getCategoryNames', () => {
    it('returns product_type as category', () => {
      expect(shopifyProductTraits.getCategoryNames(fullProduct)).toEqual(['Equipment']);
    });

    it('returns empty array when product_type is empty', () => {
      expect(shopifyProductTraits.getCategoryNames(simpleProduct)).toEqual([]);
    });
  });
});

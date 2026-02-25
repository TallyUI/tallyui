import { describe, it, expect } from 'vitest';
import { wooProductTraits } from '../traits/product';

/**
 * Realistic WooCommerce product document, shaped like the REST API v3 response.
 */
const fullProduct = {
  id: 42,
  name: 'Espresso Machine Pro',
  slug: 'espresso-machine-pro',
  type: 'simple',
  status: 'publish',
  sku: 'ESP-001',
  price: '599.99',
  regular_price: '599.99',
  sale_price: '',
  on_sale: false,
  stock_status: 'instock',
  stock_quantity: 15,
  barcode: '1234567890123',
  short_description: 'High-end espresso machine.',
  description: 'Full description here.',
  images: [
    { id: 1, src: 'https://store.example/espresso.jpg', alt: 'Espresso Machine' },
    { id: 2, src: 'https://store.example/espresso-side.jpg', alt: '' },
  ],
  categories: [
    { id: 1, name: 'Equipment', slug: 'equipment' },
    { id: 2, name: 'Coffee', slug: 'coffee' },
  ],
};

const saleProduct = {
  ...fullProduct,
  id: 43,
  price: '499.99',
  sale_price: '499.99',
  on_sale: true,
};

const variableProduct = {
  ...fullProduct,
  id: 44,
  type: 'variable',
  variations: [101, 102],
};

const minimalProduct = {
  id: 99,
};

describe('WooCommerce product traits', () => {
  describe('getId', () => {
    it('returns the product id as a string', () => {
      expect(wooProductTraits.getId(fullProduct)).toBe('42');
    });
  });

  describe('getName', () => {
    it('returns the product name', () => {
      expect(wooProductTraits.getName(fullProduct)).toBe('Espresso Machine Pro');
    });

    it('returns empty string for missing name', () => {
      expect(wooProductTraits.getName(minimalProduct)).toBe('');
    });
  });

  describe('getSku', () => {
    it('returns the SKU', () => {
      expect(wooProductTraits.getSku(fullProduct)).toBe('ESP-001');
    });

    it('returns undefined when no SKU', () => {
      expect(wooProductTraits.getSku(minimalProduct)).toBeUndefined();
    });
  });

  describe('getPrice', () => {
    it('returns the price string', () => {
      expect(wooProductTraits.getPrice(fullProduct)).toBe('599.99');
    });

    it('returns undefined for missing price', () => {
      expect(wooProductTraits.getPrice(minimalProduct)).toBeUndefined();
    });
  });

  describe('getRegularPrice / getSalePrice / isOnSale', () => {
    it('returns regular price', () => {
      expect(wooProductTraits.getRegularPrice(fullProduct)).toBe('599.99');
    });

    it('detects non-sale product', () => {
      expect(wooProductTraits.isOnSale(fullProduct)).toBe(false);
      expect(wooProductTraits.getSalePrice(fullProduct)).toBeUndefined();
    });

    it('detects sale product', () => {
      expect(wooProductTraits.isOnSale(saleProduct)).toBe(true);
      expect(wooProductTraits.getSalePrice(saleProduct)).toBe('499.99');
    });
  });

  describe('getImageUrl / getImageUrls', () => {
    it('returns the first image src', () => {
      expect(wooProductTraits.getImageUrl(fullProduct)).toBe('https://store.example/espresso.jpg');
    });

    it('returns all image URLs', () => {
      expect(wooProductTraits.getImageUrls(fullProduct)).toEqual([
        'https://store.example/espresso.jpg',
        'https://store.example/espresso-side.jpg',
      ]);
    });

    it('returns undefined / empty for missing images', () => {
      expect(wooProductTraits.getImageUrl(minimalProduct)).toBeUndefined();
      expect(wooProductTraits.getImageUrls(minimalProduct)).toEqual([]);
    });
  });

  describe('getDescription', () => {
    it('prefers short_description', () => {
      expect(wooProductTraits.getDescription(fullProduct)).toBe('High-end espresso machine.');
    });

    it('falls back to description', () => {
      const doc = { ...fullProduct, short_description: '' };
      expect(wooProductTraits.getDescription(doc)).toBe('Full description here.');
    });

    it('returns undefined when neither exists', () => {
      expect(wooProductTraits.getDescription(minimalProduct)).toBeUndefined();
    });
  });

  describe('getStockStatus / getStockQuantity', () => {
    it('returns instock status', () => {
      expect(wooProductTraits.getStockStatus(fullProduct)).toBe('instock');
    });

    it('returns stock quantity', () => {
      expect(wooProductTraits.getStockQuantity(fullProduct)).toBe(15);
    });

    it('returns unknown for unrecognised status', () => {
      expect(wooProductTraits.getStockStatus({ ...fullProduct, stock_status: 'weird' })).toBe('unknown');
    });

    it('returns null quantity when missing', () => {
      expect(wooProductTraits.getStockQuantity(minimalProduct)).toBeNull();
    });
  });

  describe('hasVariants / getType', () => {
    it('simple product has no variants', () => {
      expect(wooProductTraits.hasVariants(fullProduct)).toBe(false);
      expect(wooProductTraits.getType(fullProduct)).toBe('simple');
    });

    it('variable product has variants', () => {
      expect(wooProductTraits.hasVariants(variableProduct)).toBe(true);
      expect(wooProductTraits.getType(variableProduct)).toBe('variable');
    });

    it('defaults to simple for missing type', () => {
      expect(wooProductTraits.getType(minimalProduct)).toBe('simple');
    });
  });

  describe('getBarcode', () => {
    it('returns barcode', () => {
      expect(wooProductTraits.getBarcode(fullProduct)).toBe('1234567890123');
    });

    it('returns undefined when missing', () => {
      expect(wooProductTraits.getBarcode(minimalProduct)).toBeUndefined();
    });
  });

  describe('getCategoryNames', () => {
    it('returns category name strings', () => {
      expect(wooProductTraits.getCategoryNames(fullProduct)).toEqual(['Equipment', 'Coffee']);
    });

    it('returns empty array when no categories', () => {
      expect(wooProductTraits.getCategoryNames(minimalProduct)).toEqual([]);
    });
  });
});

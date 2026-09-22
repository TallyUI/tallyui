import { describe, it, expect } from 'vitest';
import { wooProductTraits } from '../traits/product';

describe('WooCommerce isSellable / getVariantCount', () => {
  it('allows published products', () => {
    expect(wooProductTraits.isSellable({ status: 'publish' })).toBe(true);
  });

  it.each(['draft', 'pending', 'private'])('rejects %s products', (status) => {
    expect(wooProductTraits.isSellable({ status })).toBe(false);
  });

  it('allows products with missing status', () => {
    expect(wooProductTraits.isSellable({})).toBe(true);
  });

  it('counts one variant for simple products', () => {
    expect(wooProductTraits.getVariantCount({ type: 'simple', variations: [1, 2] })).toBe(1);
  });

  it('counts the variations of variable products', () => {
    expect(wooProductTraits.getVariantCount({ type: 'variable', variations: [1] })).toBe(1);
    expect(wooProductTraits.getVariantCount({ type: 'variable', variations: [1, 2, 3] })).toBe(3);
  });

  it('handles empty and missing variation data', () => {
    expect(wooProductTraits.getVariantCount({ type: 'variable', variations: [] })).toBe(0);
    expect(wooProductTraits.getVariantCount({ type: 'variable' })).toBe(0);
    expect(wooProductTraits.getVariantCount({})).toBe(1);
  });
});

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

describe('WooCommerce neutral price and stock', () => {
  const doc = { regular_price: '20.00', price: '15.99', sale_price: '15.99', on_sale: true,
    stock_status: 'instock', manage_stock: true, stock_quantity: 4 };

  it('maps regular/sale strings to a price list in the store currency', () => {
    expect(wooProductTraits.getPrices(doc, { currency: 'eur' })).toEqual([
      { amount: 2000, currency: 'EUR', kind: 'base' },
      { amount: 1599, currency: 'EUR', kind: 'sale' },
    ]);
  });

  it('has no sale entry when not on sale, and XXX without a store currency', () => {
    expect(wooProductTraits.getPrices({ ...doc, on_sale: false })).toEqual([
      { amount: 2000, currency: 'XXX', kind: 'base' },
    ]);
  });

  it('maps stock_status strings to the neutral enum', () => {
    expect(wooProductTraits.getStock(doc)).toEqual({ status: 'in_stock', quantity: 4 });
    expect(wooProductTraits.getStock({ stock_status: 'outofstock', manage_stock: true, stock_quantity: 0 }))
      .toEqual({ status: 'out_of_stock', quantity: 0 });
    expect(wooProductTraits.getStock({ stock_status: 'onbackorder', manage_stock: false }).status)
      .toBe('backorder');
    expect(wooProductTraits.getStock({}).status).toBe('unknown');
  });

  it('leaves quantity undefined when stock is not managed', () => {
    expect(wooProductTraits.getStock({ stock_status: 'instock', manage_stock: false, stock_quantity: null }))
      .toEqual({ status: 'in_stock', quantity: undefined });
  });
});

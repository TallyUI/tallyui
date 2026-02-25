import { describe, it, expect } from 'vitest';
import { medusaProductTraits } from '../traits/product';

/**
 * Realistic MedusaJS v2 product document, shaped like the Admin API response.
 */
const fullProduct = {
  id: 'prod_01H8X3K4M2N5P7Q9R1S3T5V7',
  title: 'Commercial Espresso Machine',
  handle: 'commercial-espresso-machine',
  status: 'published',
  description: 'High-end commercial espresso machine with dual boilers.',
  thumbnail: 'https://cdn.example/thumb-espresso.jpg',
  is_giftcard: false,
  images: [
    { id: 'img_01', url: 'https://cdn.example/espresso-full.jpg' },
    { id: 'img_02', url: 'https://cdn.example/espresso-back.jpg' },
  ],
  categories: [
    { id: 'pcat_01', name: 'Equipment' },
    { id: 'pcat_02', name: 'Café Gear' },
  ],
  variants: [
    {
      id: 'var_01H',
      sku: 'MED-ESP-001',
      barcode: '9876543210001',
      ean: null,
      upc: null,
      inventory_quantity: 8,
      manage_inventory: true,
      allow_backorder: false,
      prices: [
        { currency_code: 'usd', amount: 89900 },
        { currency_code: 'eur', amount: 82500 },
      ],
    },
  ],
};

const multiVariantProduct = {
  ...fullProduct,
  id: 'prod_multi',
  variants: [
    {
      id: 'var_01',
      sku: 'MED-ESP-S',
      barcode: null,
      ean: '4006381333931',
      upc: null,
      inventory_quantity: 3,
      manage_inventory: true,
      allow_backorder: false,
      prices: [{ currency_code: 'usd', amount: 89900 }],
    },
    {
      id: 'var_02',
      sku: 'MED-ESP-L',
      barcode: null,
      ean: null,
      upc: '036000291452',
      inventory_quantity: 0,
      manage_inventory: true,
      allow_backorder: true,
      prices: [{ currency_code: 'usd', amount: 109900 }],
    },
  ],
};

const giftcardProduct = {
  ...fullProduct,
  id: 'prod_gc',
  is_giftcard: true,
  variants: [
    {
      id: 'var_gc',
      sku: 'GC-50',
      barcode: null,
      ean: null,
      upc: null,
      inventory_quantity: null,
      manage_inventory: false,
      allow_backorder: false,
      prices: [{ currency_code: 'usd', amount: 5000 }],
    },
  ],
};

const minimalProduct = {
  id: 'prod_empty',
};

describe('Medusa product traits', () => {
  describe('getId', () => {
    it('returns the product id', () => {
      expect(medusaProductTraits.getId(fullProduct)).toBe('prod_01H8X3K4M2N5P7Q9R1S3T5V7');
    });
  });

  describe('getName', () => {
    it('returns the title (not name)', () => {
      expect(medusaProductTraits.getName(fullProduct)).toBe('Commercial Espresso Machine');
    });

    it('returns empty string for missing title', () => {
      expect(medusaProductTraits.getName(minimalProduct)).toBe('');
    });
  });

  describe('getSku', () => {
    it('reads SKU from the first variant', () => {
      expect(medusaProductTraits.getSku(fullProduct)).toBe('MED-ESP-001');
    });

    it('returns undefined when no variants', () => {
      expect(medusaProductTraits.getSku(minimalProduct)).toBeUndefined();
    });
  });

  describe('getPrice', () => {
    it('converts cents to decimal string', () => {
      expect(medusaProductTraits.getPrice(fullProduct)).toBe('899.00');
    });

    it('returns undefined when no variants/prices', () => {
      expect(medusaProductTraits.getPrice(minimalProduct)).toBeUndefined();
    });
  });

  describe('getRegularPrice / getSalePrice / isOnSale', () => {
    it('regular price matches price (Medusa uses price lists, not product-level sales)', () => {
      expect(medusaProductTraits.getRegularPrice(fullProduct)).toBe('899.00');
    });

    it('sale price is always undefined (handled by price lists)', () => {
      expect(medusaProductTraits.getSalePrice(fullProduct)).toBeUndefined();
    });

    it('isOnSale is always false (no product-level sale flag)', () => {
      expect(medusaProductTraits.isOnSale(fullProduct)).toBe(false);
    });
  });

  describe('getImageUrl / getImageUrls', () => {
    it('prefers thumbnail over images[0].url', () => {
      expect(medusaProductTraits.getImageUrl(fullProduct)).toBe('https://cdn.example/thumb-espresso.jpg');
    });

    it('falls back to images[0].url when no thumbnail', () => {
      const noThumb = { ...fullProduct, thumbnail: null };
      expect(medusaProductTraits.getImageUrl(noThumb)).toBe('https://cdn.example/espresso-full.jpg');
    });

    it('returns all URLs (thumbnail + images, deduplicated)', () => {
      const urls = medusaProductTraits.getImageUrls(fullProduct);
      expect(urls).toContain('https://cdn.example/thumb-espresso.jpg');
      expect(urls).toContain('https://cdn.example/espresso-full.jpg');
      expect(urls).toContain('https://cdn.example/espresso-back.jpg');
    });

    it('returns undefined / empty for missing images', () => {
      expect(medusaProductTraits.getImageUrl(minimalProduct)).toBeUndefined();
      expect(medusaProductTraits.getImageUrls(minimalProduct)).toEqual([]);
    });
  });

  describe('getDescription', () => {
    it('returns the description', () => {
      expect(medusaProductTraits.getDescription(fullProduct)).toBe(
        'High-end commercial espresso machine with dual boilers.'
      );
    });

    it('returns undefined when missing', () => {
      expect(medusaProductTraits.getDescription(minimalProduct)).toBeUndefined();
    });
  });

  describe('getStockStatus', () => {
    it('returns instock when quantity > 0', () => {
      expect(medusaProductTraits.getStockStatus(fullProduct)).toBe('instock');
    });

    it('returns outofstock when quantity is 0 and no backorder', () => {
      const outOfStock = {
        ...fullProduct,
        variants: [{ ...fullProduct.variants[0], inventory_quantity: 0 }],
      };
      expect(medusaProductTraits.getStockStatus(outOfStock)).toBe('outofstock');
    });

    it('returns onbackorder when allow_backorder is true', () => {
      expect(medusaProductTraits.getStockStatus(multiVariantProduct)).toBe('instock');
    });

    it('returns instock when manage_inventory is false', () => {
      expect(medusaProductTraits.getStockStatus(giftcardProduct)).toBe('instock');
    });

    it('returns unknown when no variants', () => {
      expect(medusaProductTraits.getStockStatus(minimalProduct)).toBe('unknown');
    });
  });

  describe('getStockQuantity', () => {
    it('returns the first variant quantity', () => {
      expect(medusaProductTraits.getStockQuantity(fullProduct)).toBe(8);
    });

    it('returns null when no variants', () => {
      expect(medusaProductTraits.getStockQuantity(minimalProduct)).toBeNull();
    });
  });

  describe('hasVariants / getType', () => {
    it('single variant = no variants', () => {
      expect(medusaProductTraits.hasVariants(fullProduct)).toBe(false);
    });

    it('multiple variants detected', () => {
      expect(medusaProductTraits.hasVariants(multiVariantProduct)).toBe(true);
    });

    it('simple type for single variant', () => {
      expect(medusaProductTraits.getType(fullProduct)).toBe('simple');
    });

    it('variable type for multiple variants', () => {
      expect(medusaProductTraits.getType(multiVariantProduct)).toBe('variable');
    });

    it('giftcard type detected', () => {
      expect(medusaProductTraits.getType(giftcardProduct)).toBe('giftcard');
    });
  });

  describe('getBarcode', () => {
    it('returns barcode from first variant', () => {
      expect(medusaProductTraits.getBarcode(fullProduct)).toBe('9876543210001');
    });

    it('falls back to EAN', () => {
      expect(medusaProductTraits.getBarcode(multiVariantProduct)).toBe('4006381333931');
    });

    it('returns undefined when no barcode fields', () => {
      expect(medusaProductTraits.getBarcode(minimalProduct)).toBeUndefined();
    });
  });

  describe('getCategoryNames', () => {
    it('returns category name strings', () => {
      expect(medusaProductTraits.getCategoryNames(fullProduct)).toEqual(['Equipment', 'Café Gear']);
    });

    it('returns empty array when no categories', () => {
      expect(medusaProductTraits.getCategoryNames(minimalProduct)).toEqual([]);
    });
  });
});

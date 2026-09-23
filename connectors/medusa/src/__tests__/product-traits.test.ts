import { describe, it, expect } from 'vitest';
import { medusaProductTraits } from '../traits/product';

describe('Medusa isSellable / getVariantCount', () => {
  it('allows published products', () => {
    expect(medusaProductTraits.isSellable({ status: 'published' })).toBe(true);
  });

  it.each(['draft', 'proposed', 'rejected'])('rejects %s products', (status) => {
    expect(medusaProductTraits.isSellable({ status })).toBe(false);
  });

  it('allows products with missing status', () => {
    expect(medusaProductTraits.isSellable({})).toBe(true);
  });

  it('counts a single variant', () => {
    expect(medusaProductTraits.getVariantCount({ variants: [{}] })).toBe(1);
  });

  it('counts several variants', () => {
    expect(medusaProductTraits.getVariantCount({ variants: [{}, {}, {}] })).toBe(3);
  });

  it('distinguishes empty and missing variant data', () => {
    expect(medusaProductTraits.getVariantCount({ variants: [] })).toBe(0);
    expect(medusaProductTraits.getVariantCount({})).toBe(1);
  });
});

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
        { currency_code: 'usd', amount: 899 },
        { currency_code: 'eur', amount: 825 },
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
      prices: [{ currency_code: 'usd', amount: 899 }],
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
      prices: [{ currency_code: 'usd', amount: 1099 }],
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
      prices: [{ currency_code: 'usd', amount: 50 }],
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
    it('formats the major-unit amount as a decimal string', () => {
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

describe('product-level getStock', () => {
  const tracked = { manage_inventory: true, inventory_quantity: 3 };

  it('sums all tracked variants and prefers in_stock over backorder', () => {
    expect(medusaProductTraits.getStock({ variants: [
      { ...tracked, inventory_quantity: -1, allow_backorder: true }, tracked,
    ] })).toEqual({ status: 'in_stock', quantity: 2 });
  });

  it('omits quantity when one variant is untracked', () => {
    expect(medusaProductTraits.getStock({ variants: [
      { ...tracked, inventory_quantity: 0 }, { ...tracked, manage_inventory: false },
    ] })).toEqual({ status: 'in_stock', quantity: undefined });
  });

  it('sums quantities when all variants are out of stock', () => {
    expect(medusaProductTraits.getStock({ variants: [
      { ...tracked, inventory_quantity: 0 }, { ...tracked, inventory_quantity: -2 },
    ] })).toEqual({ status: 'out_of_stock', quantity: -2 });
  });

  it('returns backorder when none are in stock and one allows backorder', () => {
    expect(medusaProductTraits.getStock({ variants: [
      { ...tracked, inventory_quantity: 0 }, { ...tracked, inventory_quantity: -1, allow_backorder: true },
    ] })).toEqual({ status: 'backorder', quantity: -1 });
  });

  it.each([
    [[], { status: 'unknown' }],
    [[tracked, { manage_inventory: true }], { status: 'in_stock' }],
    [[{ ...tracked, inventory_quantity: 0 }, { manage_inventory: true }], { status: 'unknown' }],
  ])('handles missing quantities for %j', (variants, expected) => {
    expect(medusaProductTraits.getStock({ variants })).toEqual(expected);
  });

  it.each([
    [tracked, { status: 'in_stock', quantity: 3 }],
    [{ ...tracked, inventory_quantity: 0 }, { status: 'out_of_stock', quantity: 0 }],
    [{ ...tracked, inventory_quantity: -1, allow_backorder: true }, { status: 'backorder', quantity: -1 }],
    [{ ...tracked, manage_inventory: false }, { status: 'in_stock' }],
    [{ manage_inventory: true }, { status: 'unknown' }],
  ])('leaves a single variant unchanged: %j', (variant, expected) => {
    expect(medusaProductTraits.getStock({ variants: [variant] })).toStrictEqual(expected);
  });
});

describe('Medusa neutral price and stock', () => {
  // Medusa v2 amounts are major units: 12 is €12.00.
  const variant = { manage_inventory: true, allow_backorder: false, inventory_quantity: 7,
    prices: [
      { amount: 12, currency_code: 'eur', price_list_id: null },
      { amount: 13.5, currency_code: 'usd', price_list_id: null },
      { amount: 9, currency_code: 'eur', price_list_id: 'plist_1' },
    ] };

  it('maps variant prices to base entries in minor units, skipping price-list rows', () => {
    expect(medusaProductTraits.getPrices({ variants: [variant] })).toEqual([
      { amount: 1200, currency: 'EUR', kind: 'base' },
      { amount: 1350, currency: 'USD', kind: 'base' },
    ]);
  });

  it('adds a sale entry from a sale calculated_price', () => {
    const withSale = { ...variant, calculated_price: { currency_code: 'eur', calculated_amount: 9.6,
      original_amount: 12, calculated_price: { price_list_type: 'sale' } } };
    expect(medusaProductTraits.getPrices({ variants: [withSale] })).toContainEqual(
      { amount: 960, currency: 'EUR', kind: 'sale' },
    );
  });

  it('returns an empty list without variants', () => {
    expect(medusaProductTraits.getPrices({})).toEqual([]);
  });

  it('maps inventory to the neutral stock model', () => {
    expect(medusaProductTraits.getStock({ variants: [variant] })).toEqual({ status: 'in_stock', quantity: 7 });
    expect(medusaProductTraits.getStock({ variants: [{ ...variant, inventory_quantity: 0 }] }))
      .toEqual({ status: 'out_of_stock', quantity: 0 });
    expect(medusaProductTraits.getStock({ variants: [{ ...variant, inventory_quantity: 0, allow_backorder: true }] }))
      .toEqual({ status: 'backorder', quantity: 0 });
    expect(medusaProductTraits.getStock({ variants: [{ ...variant, manage_inventory: false }] }))
      .toEqual({ status: 'in_stock' });
    expect(medusaProductTraits.getStock({}).status).toBe('unknown');
  });

  it('derives quantity from Admin API inventory levels when inventory_quantity is absent', () => {
    const adminVariant = {
      manage_inventory: true,
      allow_backorder: false,
      inventory_items: [
        { required_quantity: 1, inventory: { location_levels: [
          { stocked_quantity: 10, reserved_quantity: 2 },
          { stocked_quantity: 5, reserved_quantity: 0 },
        ] } },
        // A bundle part needed twice per unit: 9 available -> 4 units.
        { required_quantity: 2, inventory: { location_levels: [{ stocked_quantity: 9, reserved_quantity: 0 }] } },
      ],
    };
    expect(medusaProductTraits.getStock({ variants: [adminVariant] })).toEqual({ status: 'in_stock', quantity: 4 });
    expect(medusaProductTraits.getStockQuantity({ variants: [adminVariant] })).toBe(4);
  });
});

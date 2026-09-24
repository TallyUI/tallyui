import { describe, it, expect } from 'vitest';
import { vendureProductTraits } from '../traits/product';
import { createVendureConnector } from '../index';

describe('Vendure isSellable / getVariantCount', () => {
  it('allows enabled products', () => {
    expect(vendureProductTraits.isSellable({ enabled: true })).toBe(true);
  });

  it('rejects disabled products', () => {
    expect(vendureProductTraits.isSellable({ enabled: false })).toBe(false);
  });

  it('allows products with missing enabled status', () => {
    expect(vendureProductTraits.isSellable({})).toBe(true);
  });

  it('counts a single variant', () => {
    expect(vendureProductTraits.getVariantCount({ variants: [{}] })).toBe(1);
  });

  it('counts several variants', () => {
    expect(vendureProductTraits.getVariantCount({ variants: [{}, {}, {}] })).toBe(3);
  });

  it('distinguishes empty and missing variant data', () => {
    expect(vendureProductTraits.getVariantCount({ variants: [] })).toBe(0);
    expect(vendureProductTraits.getVariantCount({})).toBe(1);
  });
});

/**
 * Realistic Vendure product document, shaped like the Admin GraphQL API response.
 */
const fullProduct = {
  id: '42',
  name: 'Commercial Espresso Machine',
  slug: 'commercial-espresso-machine',
  description: '<p>High-end commercial espresso machine with dual boilers.</p>',
  enabled: true,
  featuredAsset: {
    id: '89',
    preview: 'https://cdn.example.com/assets/espresso-main__preview.jpg',
  },
  assets: [
    { id: '89', preview: 'https://cdn.example.com/assets/espresso-main__preview.jpg' },
    { id: '90', preview: 'https://cdn.example.com/assets/espresso-side__preview.jpg' },
    { id: '91', preview: 'https://cdn.example.com/assets/espresso-back__preview.jpg' },
  ],
  collections: [
    { id: '5', name: 'Equipment', slug: 'equipment' },
    { id: '12', name: 'Coffee Machines', slug: 'coffee-machines' },
  ],
  facetValues: [
    { id: '23', name: 'Espresso', code: 'espresso', facet: { id: '3', name: 'Category' } },
    { id: '31', name: 'La Marzocco', code: 'la-marzocco', facet: { id: '5', name: 'Brand' } },
  ],
  variants: [
    {
      id: '101',
      name: 'Commercial Espresso Machine 110V',
      sku: 'VND-ESP-110',
      price: 489900,
      priceWithTax: 534191,
      currencyCode: 'USD',
      stockLevel: 'IN_STOCK',
      stockOnHand: 12,
      trackInventory: 'INHERIT',
      featuredAsset: null,
      options: [{ id: '14', name: '110V', code: '110v' }],
      customFields: { barcode: '5901234123457' },
    },
    {
      id: '102',
      name: 'Commercial Espresso Machine 220V',
      sku: 'VND-ESP-220',
      price: 489900,
      priceWithTax: 534191,
      currencyCode: 'USD',
      stockLevel: 'OUT_OF_STOCK',
      stockOnHand: 0,
      trackInventory: 'INHERIT',
      featuredAsset: null,
      options: [{ id: '15', name: '220V', code: '220v' }],
      customFields: {},
    },
  ],
};

const simpleProduct = {
  id: '43',
  name: 'Coffee Mug',
  slug: 'coffee-mug',
  description: 'A simple ceramic mug.',
  enabled: true,
  featuredAsset: null,
  assets: [],
  collections: [],
  facetValues: [],
  variants: [
    {
      id: '201',
      name: 'Coffee Mug',
      sku: 'MUG-001',
      price: 1299,
      priceWithTax: 1499,
      currencyCode: 'USD',
      stockLevel: 'LOW_STOCK',
      stockOnHand: 3,
      trackInventory: 'INHERIT',
      featuredAsset: null,
      options: [],
      customFields: {},
    },
  ],
};

const minimalProduct = {
  id: '999',
};

describe('Vendure product traits', () => {
  describe('getId', () => {
    it('returns the product id as a string', () => {
      expect(vendureProductTraits.getId(fullProduct)).toBe('42');
    });
  });

  describe('getName', () => {
    it('returns the name', () => {
      expect(vendureProductTraits.getName(fullProduct)).toBe('Commercial Espresso Machine');
    });

    it('returns empty string for missing name', () => {
      expect(vendureProductTraits.getName(minimalProduct)).toBe('');
    });
  });

  describe('getSku', () => {
    it('returns SKU from first variant', () => {
      expect(vendureProductTraits.getSku(fullProduct)).toBe('VND-ESP-110');
    });

    it('returns undefined when no variants', () => {
      expect(vendureProductTraits.getSku(minimalProduct)).toBeUndefined();
    });
  });

  describe('getPrice', () => {
    it('converts priceWithTax cents to decimal string', () => {
      expect(vendureProductTraits.getPrice(fullProduct)).toBe('5341.91');
    });

    it('handles smaller prices', () => {
      expect(vendureProductTraits.getPrice(simpleProduct)).toBe('14.99');
    });

    it('returns undefined when no variants', () => {
      expect(vendureProductTraits.getPrice(minimalProduct)).toBeUndefined();
    });
  });

  describe('getRegularPrice / getSalePrice / isOnSale', () => {
    it('regular price matches price (Vendure uses promotions, not product-level sales)', () => {
      expect(vendureProductTraits.getRegularPrice(fullProduct)).toBe('5341.91');
    });

    it('sale price is always undefined', () => {
      expect(vendureProductTraits.getSalePrice(fullProduct)).toBeUndefined();
    });

    it('isOnSale is always false', () => {
      expect(vendureProductTraits.isOnSale(fullProduct)).toBe(false);
    });
  });

  describe('getImageUrl / getImageUrls', () => {
    it('returns featuredAsset preview URL', () => {
      expect(vendureProductTraits.getImageUrl(fullProduct)).toBe(
        'https://cdn.example.com/assets/espresso-main__preview.jpg'
      );
    });

    it('returns all asset preview URLs', () => {
      expect(vendureProductTraits.getImageUrls(fullProduct)).toEqual([
        'https://cdn.example.com/assets/espresso-main__preview.jpg',
        'https://cdn.example.com/assets/espresso-side__preview.jpg',
        'https://cdn.example.com/assets/espresso-back__preview.jpg',
      ]);
    });

    it('returns undefined / empty when no assets', () => {
      expect(vendureProductTraits.getImageUrl(simpleProduct)).toBeUndefined();
      expect(vendureProductTraits.getImageUrls(simpleProduct)).toEqual([]);
    });
  });

  describe('getDescription', () => {
    it('returns the description', () => {
      expect(vendureProductTraits.getDescription(fullProduct)).toBe(
        '<p>High-end commercial espresso machine with dual boilers.</p>'
      );
    });

    it('returns undefined when missing', () => {
      expect(vendureProductTraits.getDescription(minimalProduct)).toBeUndefined();
    });
  });

  describe('getStockStatus', () => {
    it('maps IN_STOCK to instock', () => {
      expect(vendureProductTraits.getStockStatus(fullProduct)).toBe('instock');
    });

    it('maps LOW_STOCK to instock', () => {
      expect(vendureProductTraits.getStockStatus(simpleProduct)).toBe('instock');
    });

    it('maps OUT_OF_STOCK to outofstock', () => {
      const outOfStock = {
        ...fullProduct,
        variants: [{ ...fullProduct.variants[1] }], // 220V variant is OUT_OF_STOCK
      };
      expect(vendureProductTraits.getStockStatus(outOfStock)).toBe('outofstock');
    });

    it('returns unknown when no variants', () => {
      expect(vendureProductTraits.getStockStatus(minimalProduct)).toBe('unknown');
    });
  });

  describe('getStockQuantity', () => {
    it('returns stockOnHand from first variant', () => {
      expect(vendureProductTraits.getStockQuantity(fullProduct)).toBe(12);
    });

    it('returns null when no variants', () => {
      expect(vendureProductTraits.getStockQuantity(minimalProduct)).toBeNull();
    });
  });

  describe('hasVariants / getType', () => {
    it('multi-variant product has variants', () => {
      expect(vendureProductTraits.hasVariants(fullProduct)).toBe(true);
      expect(vendureProductTraits.getType(fullProduct)).toBe('variable');
    });

    it('single-variant product has no variants', () => {
      expect(vendureProductTraits.hasVariants(simpleProduct)).toBe(false);
      expect(vendureProductTraits.getType(simpleProduct)).toBe('simple');
    });
  });

  describe('getBarcode', () => {
    it('returns barcode from custom fields', () => {
      expect(createVendureConnector({ barcodeField: 'barcode' }).traits.product.getBarcode(fullProduct)).toBe('5901234123457');
      expect(vendureProductTraits.getBarcode(fullProduct)).toBeUndefined();
    });

    it('returns undefined when no custom barcode', () => {
      expect(vendureProductTraits.getBarcode(simpleProduct)).toBeUndefined();
    });
  });

  describe('getCategoryNames', () => {
    it('returns collection names', () => {
      expect(vendureProductTraits.getCategoryNames(fullProduct)).toEqual([
        'Equipment',
        'Coffee Machines',
      ]);
    });

    it('returns empty array when no collections', () => {
      expect(vendureProductTraits.getCategoryNames(simpleProduct)).toEqual([]);
    });
  });
});

describe('product-level getStock', () => {
  it('sums all tracked variants and uses any in-stock variant', () => {
    expect(vendureProductTraits.getStock({ variants: [
      { stockOnHand: 0 }, { stockOnHand: 3 }, { stockOnHand: 5 },
    ] })).toEqual({ status: 'in_stock', quantity: 8 });
  });

  it('omits quantity when one variant has only a stock level', () => {
    expect(vendureProductTraits.getStock({ variants: [
      { stockOnHand: 0 }, { stockLevel: 'IN_STOCK' },
    ] })).toEqual({ status: 'in_stock', quantity: undefined });
  });

  it('sums quantities when all variants are out of stock', () => {
    expect(vendureProductTraits.getStock({ variants: [
      { stockOnHand: 0 }, { stockOnHand: -2 },
    ] })).toEqual({ status: 'out_of_stock', quantity: -2 });
  });

  it.each([
    [[], { status: 'unknown' }],
    [[{ stockOnHand: 3 }, {}], { status: 'in_stock' }],
    [[{ stockOnHand: 0 }, {}], { status: 'unknown' }],
    [[{ stockOnHand: 0 }, { stockLevel: 'OUT_OF_STOCK' }], { status: 'out_of_stock' }],
  ])('handles missing quantities for %j', (variants, expected) => {
    expect(vendureProductTraits.getStock({ variants })).toEqual(expected);
  });

  it.each([
    [{ stockOnHand: 3, stockLevel: 'OUT_OF_STOCK' }, { status: 'in_stock', quantity: 3 }],
    [{ stockOnHand: 0, stockLevel: 'IN_STOCK' }, { status: 'out_of_stock', quantity: 0 }],
    [{ stockLevel: 'IN_STOCK' }, { status: 'in_stock' }],
    [{ stockLevel: 'LOW_STOCK' }, { status: 'in_stock' }],
    [{ stockLevel: 'OUT_OF_STOCK' }, { status: 'out_of_stock' }],
    [{}, { status: 'unknown' }],
  ])('leaves a single variant unchanged: %j', (variant, expected) => {
    expect(vendureProductTraits.getStock({ variants: [variant] })).toStrictEqual(expected);
  });
});

describe('Vendure neutral price and stock', () => {
  it('passes integer priceWithTax through with the variant currency', () => {
    expect(vendureProductTraits.getPrices({ variants: [{ priceWithTax: 1299, currencyCode: 'EUR' }] }))
      .toEqual([{ amount: 1299, currency: 'EUR', kind: 'base' }]);
    expect(vendureProductTraits.getPrices({})).toEqual([]);
  });

  it('prefers exact stockOnHand, then the stockLevel string', () => {
    expect(vendureProductTraits.getStock({ variants: [{ stockOnHand: 5 }] })).toEqual({ status: 'in_stock', quantity: 5 });
    expect(vendureProductTraits.getStock({ variants: [{ stockLevel: 'LOW_STOCK' }] })).toEqual({ status: 'in_stock' });
    expect(vendureProductTraits.getStock({ variants: [{ stockLevel: 'OUT_OF_STOCK' }] })).toEqual({ status: 'out_of_stock' });
    expect(vendureProductTraits.getStock({}).status).toBe('unknown');
  });
});

describe('Vendure stock locations', () => {
  const doc = { variants: [{ stockOnHand: 99, stockLevel: 'OUT_OF_STOCK', stockLevels: [
    { stockLocationId: '1', stockOnHand: 10, stockAllocated: 3 },
    { stockLocationId: '2', stockOnHand: 5, stockAllocated: 0 },
  ] }] };
  it.each([['1', 7], [undefined, 12], ['missing', 0]] as const)(
    'computes available stock for location %s', (stockLocationId, quantity) => {
      const traits = createVendureConnector({ stockLocationId }).traits.product;
      expect(traits.getStock(doc)).toEqual({ status: quantity > 0 ? 'in_stock' : 'out_of_stock', quantity });
      expect(traits.getStockQuantity(doc)).toBe(quantity);
      expect(traits.getStockStatus(doc)).toBe(quantity > 0 ? 'instock' : 'outofstock');
    },
  );
  it('retains old document fallbacks with a configured location', () => {
    const traits = createVendureConnector({ stockLocationId: '1' }).traits.product;
    expect(traits.getStock({ variants: [{ stockOnHand: 4 }] })).toEqual({ status: 'in_stock', quantity: 4 });
    expect(traits.getStock({ variants: [{ stockLevel: 'LOW_STOCK' }] })).toEqual({ status: 'in_stock' });
    expect(traits.getStock({ variants: [{ stockLevels: [], stockOnHand: 99 }] })).toEqual({ status: 'out_of_stock', quantity: 0 });
  });
});

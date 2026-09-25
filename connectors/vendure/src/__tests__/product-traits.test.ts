// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { findVariantByCode } from '@tallyui/core';
import { connectorCollection } from '@tallyui/database';
import { createOrderBuilder } from '@tallyui/pos';
import { vendureProductTraits } from '../traits/product';
import { createVendureConnector } from '../index';
import { vendureProductSchema } from '../schemas/products';
import { vendureStockReconcile } from '../reconcile/stock';

addRxPlugin(RxDBDevModePlugin);

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

// Vendure parity job 3: a variant's own `enabled` (replicated since #110)
// governs whether it is offered, priced or counted, on top of the product flag.
describe('disabled variants (Vendure parity job 3, #104)', () => {
  const bothDisabled = {
    id: '55', name: 'Grinder', enabled: true,
    variants: [
      { id: '301', price: 1000, currencyCode: 'USD', enabled: false, stockOnHand: 5 },
      { id: '302', price: 2000, currencyCode: 'USD', enabled: false, stockOnHand: 3 },
    ],
  };
  const oneLive = {
    id: '56', name: 'Grinder', enabled: true,
    variants: [
      { id: '301', price: 1000, currencyCode: 'USD', enabled: false, stockOnHand: 5 },
      { id: '302', price: 2000, currencyCode: 'USD', enabled: true, stockOnHand: 3 },
    ],
  };

  it('a product with every variant disabled is not sellable, unpriced and out of variants', () => {
    expect(vendureProductTraits.isSellable(bothDisabled)).toBe(false);
    expect(vendureProductTraits.getPrices(bothDisabled)).toEqual([]);
    expect(vendureProductTraits.getVariants!(bothDisabled)).toEqual([]);
    expect(vendureProductTraits.getStock(bothDisabled)).toEqual({ status: 'unknown' });
  });

  it('one disabled, one live: sells, prices and counts the live variant only', () => {
    expect(vendureProductTraits.isSellable(oneLive)).toBe(true);
    expect(vendureProductTraits.getPrices(oneLive)).toEqual([{ amount: 2000, currency: 'USD', kind: 'base' }]);
    const variants = vendureProductTraits.getVariants!(oneLive);
    expect(variants).toHaveLength(1);
    expect(variants[0].id).toBe('302');
    expect(vendureProductTraits.getVariantCount(oneLive)).toBe(1);
    expect(vendureProductTraits.getStock(oneLive)).toEqual({ status: 'in_stock', quantity: 3 });
  });

  it('a missing enabled flag on a variant is treated as live, unlike an explicit false', () => {
    const doc = { enabled: true, variants: [{ id: '1', price: 500, currencyCode: 'USD' }] };
    expect(vendureProductTraits.isSellable(doc)).toBe(true);
    expect(vendureProductTraits.getVariantCount(doc)).toBe(1);
  });

  it('the product flag still wins over live variants', () => {
    const doc = { enabled: false, variants: [{ id: '1', price: 500, currencyCode: 'USD' }] };
    expect(vendureProductTraits.isSellable(doc)).toBe(false);
  });

  it("addProduct refuses an all-disabled product with #104's message", () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
    expect(() => builder.addProduct(bothDisabled, vendureProductTraits))
      .toThrow("addProduct: this product isn't sold in this store's channel");
    expect(builder.getSnapshot().lineItems).toHaveLength(0);
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
    it('converts net price cents to decimal string by default', () => {
      expect(vendureProductTraits.getPrice(fullProduct)).toBe('4899.00');
    });

    it('handles smaller prices', () => {
      expect(vendureProductTraits.getPrice(simpleProduct)).toBe('12.99');
    });

    it('returns undefined when no variants', () => {
      expect(vendureProductTraits.getPrice(minimalProduct)).toBeUndefined();
    });
  });

  describe('getRegularPrice / getSalePrice / isOnSale', () => {
    it('regular price matches price (Vendure uses promotions, not product-level sales)', () => {
      expect(vendureProductTraits.getRegularPrice(fullProduct)).toBe('4899.00');
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

  it('clamps a negative saleable quantity to 0 per variant, then sums (backlog 28)', () => {
    expect(vendureProductTraits.getStock({ variants: [
      { stockOnHand: 0 }, { stockOnHand: -2 },
    ] })).toEqual({ status: 'out_of_stock', quantity: 0 });
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
  it('passes integer net price through with the variant currency', () => {
    expect(vendureProductTraits.getPrices({ variants: [{ price: 1299, currencyCode: 'EUR' }] }))
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

describe('Vendure variants and channel prices', () => {
  const doc = { variants: [
    { id: 1, name: 'Small', sku: 'SKU-S', price: 1000, priceWithTax: 1200, currencyCode: 'eur',
      stockLevels: [{ stockLocationId: '1', stockOnHand: 5, stockAllocated: 2 },
        { stockLocationId: '2', stockOnHand: 8, stockAllocated: 1 }] },
    { id: 2, name: 'Medium', sku: 'SKU-M', price: 2000, priceWithTax: 2400,
      stockOnHand: 0, customFields: { barcode: 'BAR-M' } },
    { id: 3, name: 'Large', sku: 'SKU-L', price: 3000, priceWithTax: 3600, stockLevel: 'LOW_STOCK' },
  ] };

  it('returns every variant with its own details, prices and stock', () => {
    const traits = createVendureConnector({ barcodeField: 'barcode', stockLocationId: '1' }).traits.product;
    const variants = traits.getVariants!(doc, { currency: 'usd' });
    expect(variants).toEqual([
      { id: '1', title: 'Small', sku: 'SKU-S', barcode: undefined,
        prices: [{ amount: 1000, currency: 'EUR', kind: 'base' }], stock: { status: 'in_stock', quantity: 3 } },
      { id: '2', title: 'Medium', sku: 'SKU-M', barcode: 'BAR-M',
        prices: [{ amount: 2000, currency: 'USD', kind: 'base' }], stock: { status: 'out_of_stock', quantity: 0 } },
      { id: '3', title: 'Large', sku: 'SKU-L', barcode: undefined,
        prices: [{ amount: 3000, currency: 'USD', kind: 'base' }], stock: { status: 'in_stock' } },
    ]);
    expect(findVariantByCode(variants, 'BAR-M')).toBe(variants[1]);
  });

  it('finds a SKU without a barcode option and sums variant stock across locations', () => {
    const variants = createVendureConnector().traits.product.getVariants!(doc);
    expect(findVariantByCode(variants, 'SKU-L')).toBe(variants[2]);
    expect(variants[1].barcode).toBeUndefined();
    expect(variants[0].stock).toEqual({ status: 'in_stock', quantity: 10 });
  });

  it.each([[undefined, 1000], [false, 1000], [true, 1200]] as const)(
    'selects the channel price with pricesIncludeTax=%s', (pricesIncludeTax, amount) => {
      const traits = createVendureConnector({ pricesIncludeTax }).traits.product;
      const prices = [{ amount, currency: 'EUR', kind: 'base' }];
      expect(traits.getPrices(doc)).toEqual(prices);
      expect(traits.getVariants!(doc)[0].prices).toEqual(prices);
      expect(traits.getPrice(doc)).toBe((amount / 100).toFixed(2));
      expect(traits.getRegularPrice(doc)).toBe((amount / 100).toFixed(2));
    },
  );

  it.each([['gbp', 'GBP'], [undefined, 'XXX']])('falls back to currency %s', (currency, expected) => {
    const product = { variants: [{ id: 1, price: 1000 }] };
    const prices = [{ amount: 1000, currency: expected, kind: 'base' }];
    expect(vendureProductTraits.getPrices(product, { currency })).toEqual(prices);
    expect(vendureProductTraits.getVariants!(product, { currency })[0].prices).toEqual(prices);
  });

  it.each([false, true])('keeps missing selected prices empty and preserves zero (%s)', (pricesIncludeTax) => {
    const traits = createVendureConnector({ pricesIncludeTax }).traits.product;
    const field = pricesIncludeTax ? 'priceWithTax' : 'price';
    for (const amount of [null, undefined, 0]) {
      const product = { variants: [{ id: 1, price: 1000, priceWithTax: 1200, [field]: amount }] };
      const prices = amount == null ? [] : [{ amount: 0, currency: 'XXX', kind: 'base' }];
      expect(traits.getPrices(product)).toEqual(prices);
      expect(traits.getVariants!(product)[0].prices).toEqual(prices);
      expect(traits.getPrice(product)).toBe(amount == null ? undefined : '0.00');
      expect(traits.getRegularPrice(product)).toBe(amount == null ? undefined : '0.00');
    }
  });

  it('handles missing variant details and empty products', () => {
    expect(vendureProductTraits.getVariants!({ variants: [{ id: 1, sku: '' }] })).toEqual([
      { id: '1', title: undefined, sku: undefined, barcode: undefined, prices: [], stock: { status: 'unknown' } },
    ]);
    expect(vendureProductTraits.getVariants!({})).toEqual([]);
    expect(vendureProductTraits.getVariants!({ variants: [] })).toEqual([]);
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

// backlog 28 (#45 stock review): trackInventory, the out-of-stock threshold and
// aggregation across every variant, not variant 0.
describe('trackInventory (design point 3a)', () => {
  it('FALSE is always in stock, with no quantity, even with 0 on hand', () => {
    expect(vendureProductTraits.getStock({ variants: [{ trackInventory: 'FALSE', stockOnHand: 0 }] }))
      .toEqual({ status: 'in_stock' });
  });

  it('INHERIT with the global setting off is also always in stock', () => {
    const traits = createVendureConnector({ globalTrackInventory: false }).traits.product;
    expect(traits.getStock({ variants: [{ trackInventory: 'INHERIT', stockOnHand: 0 }] }))
      .toEqual({ status: 'in_stock' });
  });

  it('INHERIT with the global setting on (the default) tracks, and 0 on hand is out of stock', () => {
    expect(vendureProductTraits.getStock({ variants: [{ trackInventory: 'INHERIT', stockOnHand: 0 }] }))
      .toEqual({ status: 'out_of_stock', quantity: 0 });
  });
});

describe('outOfStockThreshold (design point 3b)', () => {
  it('subtracts the per-variant threshold from on hand minus allocated', () => {
    expect(vendureProductTraits.getStock({ variants: [{
      useGlobalOutOfStockThreshold: false, outOfStockThreshold: 3,
      stockLevels: [{ stockLocationId: '1', stockOnHand: 10, stockAllocated: 2 }],
    }] })).toEqual({ status: 'in_stock', quantity: 5 });
  });

  it('subtracts the global threshold when useGlobalOutOfStockThreshold is not false', () => {
    const traits = createVendureConnector({ globalOutOfStockThreshold: 3 }).traits.product;
    expect(traits.getStock({ variants: [{
      stockLevels: [{ stockLocationId: '1', stockOnHand: 10, stockAllocated: 2 }],
    }] })).toEqual({ status: 'in_stock', quantity: 5 });
  });

  it('saleable <= 0 is out of stock', () => {
    expect(vendureProductTraits.getStock({ variants: [{
      useGlobalOutOfStockThreshold: false, outOfStockThreshold: 5, stockOnHand: 5,
    }] })).toEqual({ status: 'out_of_stock', quantity: 0 });
  });

  it('a negative threshold (-5) with 0 on hand is a backorder', () => {
    expect(vendureProductTraits.getStock({ variants: [{
      useGlobalOutOfStockThreshold: false, outOfStockThreshold: -5, stockOnHand: 0,
    }] })).toEqual({ status: 'backorder', quantity: 5 });
  });
});

describe('getStockStatus / getStockQuantity aggregate every variant (design point 4)', () => {
  it('one out, one in: instock overall and the sum of quantities', () => {
    const doc = { variants: [{ stockOnHand: 0 }, { stockOnHand: 4 }] };
    expect(vendureProductTraits.getStockStatus(doc)).toBe('instock');
    expect(vendureProductTraits.getStockQuantity(doc)).toBe(4);
  });
});

describe('the stock overlay applies tracking and the threshold on top (design point 5)', () => {
  it('a fresh overlaid stockLevels still gets the threshold subtracted', () => {
    const doc = { variants: [{
      id: 'v1', useGlobalOutOfStockThreshold: false, outOfStockThreshold: 3,
      stockLevels: [{ stockLocationId: '1', stockOnHand: 1, stockAllocated: 0 }],
    }] };
    const overlay = vendureStockReconcile.overlay(doc, new Map([
      ['v1', [{ stockLocationId: '1', stockOnHand: 10, stockAllocated: 2 }]],
    ]));
    expect(vendureProductTraits.getStock({ ...doc, ...overlay })).toEqual({ status: 'in_stock', quantity: 5 });
  });
});

describe('vendureProductSchema v1 (backlog 28)', () => {
  it('inserts a document with the new stock-tracking and enabled fields', async () => {
    const db = await createRxDatabase({
      name: `vendureschemav1${Date.now()}`, multiInstance: false,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    });
    const { products } = await db.addCollections({ products: connectorCollection(vendureProductSchema) });
    const doc = await products.insert({
      id: '1', name: 'Widget', variants: [{
        id: '1', trackInventory: 'FALSE', outOfStockThreshold: -5,
        useGlobalOutOfStockThreshold: false, enabled: true,
      }],
    });
    expect(doc.toJSON().variants[0]).toMatchObject({
      trackInventory: 'FALSE', outOfStockThreshold: -5, useGlobalOutOfStockThreshold: false, enabled: true,
    });
    await db.close();
  });
});

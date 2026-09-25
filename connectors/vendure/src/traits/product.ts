import type { ProductTraits, StockLevel } from '@tallyui/core';

function productStock(variants: StockLevel[]): StockLevel {
  if (!variants.length) return { status: 'unknown' };
  const status = variants.some((stock) => stock.status === 'in_stock') ? 'in_stock'
    : variants.some((stock) => stock.status === 'backorder') ? 'backorder'
    : variants.every((stock) => stock.status === 'out_of_stock') ? 'out_of_stock' : 'unknown';
  const quantity = variants.every((stock) => stock.quantity != null)
    ? variants.reduce((sum, stock) => sum + stock.quantity!, 0) : undefined;
  return quantity === undefined ? { status } : { status, quantity };
}

/**
 * Per-variant stock (backlog 28, #45 stock review). Untracked (`trackInventory`
 * `FALSE`, or `INHERIT` with the global setting off) is always sellable, with no
 * quantity. A tracked variant's saleable units are on hand minus allocated minus
 * the effective threshold (global unless `useGlobalOutOfStockThreshold` is
 * `false`) -- Vendure's own rule (`@vendure/core` 3.7.3,
 * `dist/service/services/product-variant.service.js:270-274`,
 * `getSaleableStockLevel`: `stockOnHand - stockAllocated - effectiveOutOfStockThreshold`).
 * `backorder` is saleable > 0 with on-hand-less-allocated <= 0 (a negative
 * threshold). The Shop API's `stockLevel` string is a last-resort fallback
 * when neither `stockLevels` nor `stockOnHand` is present.
 */
function variantStock(
  variant: any,
  stockLocationId: string | undefined,
  globalTrackInventory: boolean,
  globalOutOfStockThreshold: number,
): StockLevel {
  if (!variant) return { status: 'unknown' };
  const tracked = variant.trackInventory === 'TRUE'
    || (variant.trackInventory !== 'FALSE' && globalTrackInventory);
  if (!tracked) return { status: 'in_stock' };

  const threshold = variant.useGlobalOutOfStockThreshold !== false
    ? globalOutOfStockThreshold : (variant.outOfStockThreshold ?? 0);

  let onHandLessAllocated: number | undefined;
  if (variant.stockLevels != null) {
    onHandLessAllocated = variant.stockLevels
      .filter((level: any) => stockLocationId == null || String(level.stockLocationId) === stockLocationId)
      .reduce((sum: number, level: any) => sum + level.stockOnHand - level.stockAllocated, 0);
  } else if (variant.stockOnHand != null) {
    onHandLessAllocated = variant.stockOnHand;
  }

  if (onHandLessAllocated != null) {
    const saleable = onHandLessAllocated - threshold;
    const status = saleable <= 0 ? 'out_of_stock' : onHandLessAllocated > 0 ? 'in_stock' : 'backorder';
    return { status, quantity: Math.max(saleable, 0) };
  }

  // Shop API: only the stockLevel string, so tracking/threshold cannot apply.
  if (variant.stockLevel === 'IN_STOCK' || variant.stockLevel === 'LOW_STOCK') return { status: 'in_stock' };
  if (variant.stockLevel === 'OUT_OF_STOCK') return { status: 'out_of_stock' };
  return { status: 'unknown' };
}

// Vendure's variant `enabled` (replicated since #110): a disabled variant is
// not offered, priced or counted; a product with none left is not sellable
// (#104 hides it).
function liveVariants(doc: any): any[] {
  return (doc.variants ?? []).filter((variant: any) => variant.enabled !== false);
}

/**
 * Vendure product trait implementations.
 *
 * Key differences from other connectors:
 * - Product name is `name` (same as WooCommerce, unlike Medusa's `title`)
 * - Price is on `variants[].price` or `priceWithTax`, according to the channel (integer cents)
 * - Images use `featuredAsset.preview` and `assets[].preview`
 * - Stock status is a string from the Shop API: 'IN_STOCK', 'OUT_OF_STOCK', 'LOW_STOCK'
 * - Categories are `collections[].name` (Vendure's equivalent of categories)
 * - No native sale price — Vendure handles sales via promotions at checkout
 * - No native barcode field — uses custom fields if configured
 */
export function createVendureProductTraits(
  barcodeField?: string,
  stockLocationId?: string,
  pricesIncludeTax = false,
  globalTrackInventory = true,
  globalOutOfStockThreshold = 0,
): ProductTraits {
const priceField = pricesIncludeTax ? 'priceWithTax' : 'price';
const traits: ProductTraits = {
  getId: (doc) => String(doc.id),

  getName: (doc) => doc.name ?? '',

  getSku: (doc) => doc.variants?.[0]?.sku || undefined,

  getPrices: (doc, context) => {
    const variant = liveVariants(doc)[0];
    // Both price fields are already integers in minor units.
    const amount = variant?.[priceField];
    if (amount == null) return [];
    const currency = String(variant.currencyCode ?? context?.currency ?? 'XXX').toUpperCase();
    // Vendure applies sales as order-level promotions, so there is no sale entry.
    return [{ amount, currency, kind: 'base' }];
  },

  getVariants: (doc, context) => liveVariants(doc).map((variant: any) => ({
    id: String(variant.id),
    title: variant.name || undefined,
    sku: variant.sku || undefined,
    barcode: barcodeField ? variant.customFields?.[barcodeField] || undefined : undefined,
    prices: traits.getPrices({ variants: [variant] }, context),
    stock: traits.getStock({ variants: [variant] }),
  })),

  getStock: (doc) => productStock(liveVariants(doc).map((variant: any) =>
    variantStock(variant, stockLocationId, globalTrackInventory, globalOutOfStockThreshold))),

  getPrice: (doc) => {
    // Vendure stores prices as integers in smallest currency unit (cents)
    const amount = liveVariants(doc)[0]?.[priceField];
    if (amount == null) return undefined;
    return (amount / 100).toFixed(2);
  },

  getRegularPrice: (doc) => {
    // Vendure has no separate regular/sale price — promotions happen at checkout
    const amount = liveVariants(doc)[0]?.[priceField];
    if (amount == null) return undefined;
    return (amount / 100).toFixed(2);
  },

  getSalePrice: () => {
    // Vendure handles sales via promotions at the order level
    return undefined;
  },

  isOnSale: () => {
    // No product-level sale flag in Vendure
    return false;
  },

  getImageUrl: (doc) =>
    doc.featuredAsset?.preview || doc.assets?.[0]?.preview || undefined,

  getImageUrls: (doc) =>
    (doc.assets ?? []).map((a: any) => a.preview).filter(Boolean),

  getDescription: (doc) => doc.description || undefined,

  // Aggregated across every variant, like getStock (backlog 28), not variant 0.
  getStockStatus: (doc) => {
    const status = traits.getStock(doc).status;
    if (status === 'in_stock' || status === 'backorder') return 'instock';
    if (status === 'out_of_stock') return 'outofstock';
    return 'unknown';
  },

  getStockQuantity: (doc) => traits.getStock(doc).quantity ?? null,

  hasVariants: (doc) => (doc.variants?.length ?? 0) > 1,

  // A product with no variants at all keeps the product-level-only answer.
  isSellable: (doc) => doc.enabled !== false
    && ((doc.variants?.length ?? 0) === 0 || liveVariants(doc).length > 0),

  getVariantCount: (doc) => doc.variants ? liveVariants(doc).length : 1,

  getType: (doc) => {
    // Vendure has no native product type field
    if ((doc.variants?.length ?? 0) > 1) return 'variable';
    return 'simple';
  },

  getBarcode: (doc) => {
    // Vendure has no native barcode — check custom fields
    return barcodeField ? doc.variants?.[0]?.customFields?.[barcodeField] || undefined : undefined;
  },

  getCategoryNames: (doc) =>
    (doc.collections ?? []).map((c: any) => c.name).filter(Boolean),
};
return traits;
}

export const vendureProductTraits = createVendureProductTraits();

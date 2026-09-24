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
export function createVendureProductTraits(barcodeField?: string, stockLocationId?: string, pricesIncludeTax = false): ProductTraits {
const priceField = pricesIncludeTax ? 'priceWithTax' : 'price';
const traits: ProductTraits = {
  getId: (doc) => String(doc.id),

  getName: (doc) => doc.name ?? '',

  getSku: (doc) => doc.variants?.[0]?.sku || undefined,

  getPrices: (doc, context) => {
    const variant = doc.variants?.[0];
    // Both price fields are already integers in minor units.
    const amount = variant?.[priceField];
    if (amount == null) return [];
    const currency = String(variant.currencyCode ?? context?.currency ?? 'XXX').toUpperCase();
    // Vendure applies sales as order-level promotions, so there is no sale entry.
    return [{ amount, currency, kind: 'base' }];
  },

  getVariants: (doc, context) => (doc.variants ?? []).map((variant: any) => ({
    id: String(variant.id),
    title: variant.name || undefined,
    sku: variant.sku || undefined,
    barcode: barcodeField ? variant.customFields?.[barcodeField] || undefined : undefined,
    prices: traits.getPrices({ variants: [variant] }, context),
    stock: traits.getStock({ variants: [variant] }),
  })),

  getStock: (doc) => productStock((doc.variants ?? []).map((variant: any): StockLevel => {
    if (!variant) return { status: 'unknown' };
    if (variant.stockLevels != null) {
      const quantity = variant.stockLevels
        .filter((level: any) => stockLocationId == null || String(level.stockLocationId) === stockLocationId)
        .reduce((sum: number, level: any) => sum + level.stockOnHand - level.stockAllocated, 0);
      return { status: quantity > 0 ? 'in_stock' : 'out_of_stock', quantity };
    }
    // Admin API: exact stockOnHand. Shop API: only the stockLevel string.
    if (variant.stockOnHand != null) {
      return {
        status: variant.stockOnHand > 0 ? 'in_stock' : 'out_of_stock',
        quantity: variant.stockOnHand,
      };
    }
    if (variant.stockLevel === 'IN_STOCK' || variant.stockLevel === 'LOW_STOCK') {
      return { status: 'in_stock' };
    }
    if (variant.stockLevel === 'OUT_OF_STOCK') return { status: 'out_of_stock' };
    return { status: 'unknown' };
  })),

  getPrice: (doc) => {
    // Vendure stores prices as integers in smallest currency unit (cents)
    const amount = doc.variants?.[0]?.[priceField];
    if (amount == null) return undefined;
    return (amount / 100).toFixed(2);
  },

  getRegularPrice: (doc) => {
    // Vendure has no separate regular/sale price — promotions happen at checkout
    const amount = doc.variants?.[0]?.[priceField];
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

  getStockStatus: (doc) => {
    const variant = doc.variants?.[0];
    if (!variant) return 'unknown';
    if (variant.stockLevels != null) {
      return traits.getStock({ variants: [variant] }).quantity! > 0 ? 'instock' : 'outofstock';
    }

    // Vendure Shop API returns stockLevel as a string
    const level = variant.stockLevel;
    if (level === 'IN_STOCK' || level === 'LOW_STOCK') return 'instock';
    if (level === 'OUT_OF_STOCK') return 'outofstock';

    // Fall back to Admin API stockOnHand if available
    if (variant.stockOnHand != null) {
      return variant.stockOnHand > 0 ? 'instock' : 'outofstock';
    }

    return 'unknown';
  },

  getStockQuantity: (doc) => {
    if (doc.variants?.[0]?.stockLevels != null) {
      return traits.getStock({ variants: [doc.variants[0]] }).quantity ?? null;
    }
    // stockOnHand is available from Admin API; Shop API only has the string stockLevel
    return doc.variants?.[0]?.stockOnHand ?? null;
  },

  hasVariants: (doc) => (doc.variants?.length ?? 0) > 1,

  isSellable: (doc) => doc.enabled !== false,

  getVariantCount: (doc) => doc.variants?.length ?? 1,

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

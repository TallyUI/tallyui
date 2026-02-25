import type { ProductTraits } from '@tallyui/core';

/**
 * Vendure product trait implementations.
 *
 * Key differences from other connectors:
 * - Product name is `name` (same as WooCommerce, unlike Medusa's `title`)
 * - Price is on `variants[].priceWithTax` (integer cents, like Medusa)
 * - Images use `featuredAsset.preview` and `assets[].preview`
 * - Stock status is a string from the Shop API: 'IN_STOCK', 'OUT_OF_STOCK', 'LOW_STOCK'
 * - Categories are `collections[].name` (Vendure's equivalent of categories)
 * - No native sale price — Vendure handles sales via promotions at checkout
 * - No native barcode field — uses custom fields if configured
 */
export const vendureProductTraits: ProductTraits = {
  getId: (doc) => String(doc.id),

  getName: (doc) => doc.name ?? '',

  getSku: (doc) => doc.variants?.[0]?.sku || undefined,

  getPrice: (doc) => {
    // Vendure stores prices as integers in smallest currency unit (cents)
    const amount = doc.variants?.[0]?.priceWithTax;
    if (amount == null) return undefined;
    return (amount / 100).toFixed(2);
  },

  getRegularPrice: (doc) => {
    // Vendure has no separate regular/sale price — promotions happen at checkout
    const amount = doc.variants?.[0]?.priceWithTax;
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
    // stockOnHand is available from Admin API; Shop API only has the string stockLevel
    return doc.variants?.[0]?.stockOnHand ?? null;
  },

  hasVariants: (doc) => (doc.variants?.length ?? 0) > 1,

  getType: (doc) => {
    // Vendure has no native product type field
    if ((doc.variants?.length ?? 0) > 1) return 'variable';
    return 'simple';
  },

  getBarcode: (doc) => {
    // Vendure has no native barcode — check custom fields
    return doc.variants?.[0]?.customFields?.barcode || undefined;
  },

  getCategoryNames: (doc) =>
    (doc.collections ?? []).map((c: any) => c.name).filter(Boolean),
};

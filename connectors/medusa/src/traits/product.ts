import type { ProductTraits } from '@tallyui/core';

/**
 * Medusa v2 product trait implementations.
 *
 * Key mapping differences from WooCommerce:
 * - Product name is `title` (not `name`)
 * - Price lives on `variants[0].prices[0].amount` (cents, integer)
 * - Images use `url` (not `src`)
 * - SKU/barcode live on variants, not the product
 * - Categories use `name`, tags use `value`
 * - Stock is per-variant via `inventory_quantity`
 */
export const medusaProductTraits: ProductTraits = {
  getId: (doc) => doc.id,

  getName: (doc) => doc.title ?? '',

  getSku: (doc) => {
    // SKU lives on variants in Medusa
    return doc.variants?.[0]?.sku || undefined;
  },

  getPrice: (doc) => {
    // Medusa stores prices as integers in smallest currency unit (cents)
    const amount = doc.variants?.[0]?.prices?.[0]?.amount;
    if (amount == null) return undefined;
    // Convert cents to decimal string (assumes 2 decimal places)
    return (amount / 100).toFixed(2);
  },

  getRegularPrice: (doc) => {
    // Medusa doesn't have a separate regular/sale price on the product level
    // The pricing engine handles this via price lists
    const amount = doc.variants?.[0]?.prices?.[0]?.amount;
    if (amount == null) return undefined;
    return (amount / 100).toFixed(2);
  },

  getSalePrice: () => {
    // Sale prices in Medusa come from price lists, not a product field
    return undefined;
  },

  isOnSale: () => {
    // Would need to compare calculated_price vs original_price from Store API
    return false;
  },

  getImageUrl: (doc) => {
    // Thumbnail first, then first image
    return doc.thumbnail || doc.images?.[0]?.url || undefined;
  },

  getImageUrls: (doc) => {
    const urls: string[] = [];
    if (doc.thumbnail) urls.push(doc.thumbnail);
    for (const img of doc.images ?? []) {
      if (img.url && img.url !== doc.thumbnail) urls.push(img.url);
    }
    return urls;
  },

  getDescription: (doc) => doc.description || undefined,

  getStockStatus: (doc) => {
    const variant = doc.variants?.[0];
    if (!variant) return 'unknown';

    if (variant.manage_inventory === false) return 'instock';
    if (variant.allow_backorder) return 'onbackorder';

    const qty = variant.inventory_quantity;
    if (qty == null) return 'unknown';
    return qty > 0 ? 'instock' : 'outofstock';
  },

  getStockQuantity: (doc) => {
    return doc.variants?.[0]?.inventory_quantity ?? null;
  },

  hasVariants: (doc) => {
    return (doc.variants?.length ?? 0) > 1;
  },

  getType: (doc) => {
    // Medusa doesn't have product types like WooCommerce
    // A gift card is the closest equivalent to a "type"
    if (doc.is_giftcard) return 'giftcard';
    if ((doc.variants?.length ?? 0) > 1) return 'variable';
    return 'simple';
  },

  getBarcode: (doc) => {
    const variant = doc.variants?.[0];
    return variant?.barcode || variant?.ean || variant?.upc || undefined;
  },

  getCategoryNames: (doc) =>
    (doc.categories ?? []).map((cat: any) => cat.name).filter(Boolean),
};

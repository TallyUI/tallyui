import type { ProductTraits } from '@tallyui/core';

/**
 * Shopify product trait implementations.
 *
 * Key differences from WooCommerce / Medusa:
 * - Product name is `title` (same as Medusa)
 * - Price, SKU, barcode, inventory all live on variants, not the product
 * - Sale detection uses `compare_at_price` > `price` (no explicit on_sale flag)
 * - Description is `body_html` (single field, HTML)
 * - Categories don't exist on the product — `product_type` is the closest thing
 * - Stock status is derived from inventory_management + inventory_policy + quantity
 */
export const shopifyProductTraits: ProductTraits = {
  getId: (doc) => String(doc.id),

  getName: (doc) => doc.title ?? '',

  getSku: (doc) => doc.variants?.[0]?.sku || undefined,

  getPrice: (doc) => doc.variants?.[0]?.price || undefined,

  getRegularPrice: (doc) => {
    const variant = doc.variants?.[0];
    if (!variant) return undefined;
    // compare_at_price is the "original" price; fall back to current price
    return variant.compare_at_price || variant.price || undefined;
  },

  getSalePrice: (doc) => {
    const variant = doc.variants?.[0];
    if (!variant) return undefined;
    // In Shopify, when compare_at_price > price, the product is on sale
    // and `price` IS the sale price
    if (
      variant.compare_at_price &&
      parseFloat(variant.compare_at_price) > parseFloat(variant.price)
    ) {
      return variant.price;
    }
    return undefined;
  },

  isOnSale: (doc) => {
    const variant = doc.variants?.[0];
    if (!variant?.compare_at_price) return false;
    return parseFloat(variant.compare_at_price) > parseFloat(variant.price);
  },

  getImageUrl: (doc) => doc.image?.src || doc.images?.[0]?.src || undefined,

  getImageUrls: (doc) =>
    (doc.images ?? []).map((img: any) => img.src).filter(Boolean),

  getDescription: (doc) => doc.body_html || undefined,

  getStockStatus: (doc) => {
    const variant = doc.variants?.[0];
    if (!variant) return 'unknown';

    // Not tracking inventory — always in stock
    if (variant.inventory_management == null) return 'instock';

    // Allows overselling — treat as backorderable
    if (variant.inventory_policy === 'continue') return 'onbackorder';

    // Tracking inventory, deny when out of stock
    const qty = variant.inventory_quantity;
    if (qty == null) return 'unknown';
    return qty > 0 ? 'instock' : 'outofstock';
  },

  getStockQuantity: (doc) => doc.variants?.[0]?.inventory_quantity ?? null,

  hasVariants: (doc) => (doc.variants?.length ?? 0) > 1,

  getType: (doc) => doc.product_type || 'simple',

  getBarcode: (doc) => doc.variants?.[0]?.barcode || undefined,

  getCategoryNames: (doc) => {
    // Shopify doesn't embed collections on the product object.
    // product_type is the closest inline field.
    const names: string[] = [];
    if (doc.product_type) names.push(doc.product_type);
    return names;
  },
};

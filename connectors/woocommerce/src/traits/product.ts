import type { ProductTraits } from '@tallyui/core';

/**
 * WooCommerce product trait implementations.
 *
 * Maps the WooCommerce REST API product shape to the universal
 * Tally UI product interface.
 */
export const wooProductTraits: ProductTraits = {
  getId: (doc) => String(doc.id),

  getName: (doc) => doc.name ?? '',

  getSku: (doc) => doc.sku || undefined,

  getPrice: (doc) => doc.price || undefined,

  getRegularPrice: (doc) => doc.regular_price || undefined,

  getSalePrice: (doc) => doc.sale_price || undefined,

  isOnSale: (doc) => doc.on_sale === true,

  getImageUrl: (doc) => doc.images?.[0]?.src || undefined,

  getImageUrls: (doc) => (doc.images ?? []).map((img: any) => img.src).filter(Boolean),

  getDescription: (doc) => doc.short_description || doc.description || undefined,

  getStockStatus: (doc) => {
    const status = doc.stock_status;
    if (status === 'instock' || status === 'outofstock' || status === 'onbackorder') {
      return status;
    }
    return 'unknown';
  },

  getStockQuantity: (doc) => doc.stock_quantity ?? null,

  hasVariants: (doc) => doc.type === 'variable',

  getType: (doc) => doc.type ?? 'simple',

  getBarcode: (doc) => doc.barcode || undefined,

  getCategoryNames: (doc) =>
    (doc.categories ?? []).map((cat: any) => cat.name).filter(Boolean),
};

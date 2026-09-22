import { moneyFromMajor } from '@tallyui/core';
import type { ProductPrice, ProductTraits, StockStatus } from '@tallyui/core';

/** WooCommerce's stock_status strings, mapped to the neutral enum. */
const WOO_STOCK_STATUS: Record<string, StockStatus> = {
  instock: 'in_stock',
  outofstock: 'out_of_stock',
  onbackorder: 'backorder',
};

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

  getPrices: (doc, context) => {
    // Woo prices are decimal strings with no currency; the store supplies it.
    const currency = context?.currency ?? 'XXX';
    const prices: ProductPrice[] = [];
    const base = moneyFromMajor(doc.regular_price || doc.price, currency);
    if (base) prices.push({ ...base, kind: 'base' });
    const sale = doc.on_sale === true ? moneyFromMajor(doc.sale_price, currency) : undefined;
    if (sale) prices.push({ ...sale, kind: 'sale' });
    return prices;
  },

  getStock: (doc) => ({
    status: WOO_STOCK_STATUS[doc.stock_status] ?? 'unknown',
    quantity: doc.manage_stock === false ? undefined : doc.stock_quantity ?? undefined,
  }),

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

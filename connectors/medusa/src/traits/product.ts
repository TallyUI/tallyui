import { minorUnitDigits } from '@tallyui/core';
import type { ProductPrice, ProductTraits } from '@tallyui/core';

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

  getPrices: (doc) => {
    const variant = doc.variants?.[0];
    if (!variant) return [];
    const prices: ProductPrice[] = [];
    const seen = new Set<string>();
    // Medusa v2 amounts are major units (12 = €12.00), not cents.
    const toMinor = (amount: unknown, currency: string) =>
      Math.round(Number(amount) * 10 ** minorUnitDigits(currency));

    // Base prices: the variant's own prices, first per currency, skipping
    // price-list overrides.
    for (const price of variant.prices ?? []) {
      if (price?.price_list_id || price?.amount == null || !price.currency_code) continue;
      const currency = String(price.currency_code).toUpperCase();
      if (seen.has(currency)) continue;
      seen.add(currency);
      prices.push({ amount: toMinor(price.amount, currency), currency, kind: 'base' });
    }

    // Sale prices come from sale price lists. Medusa resolves them into
    // `calculated_price` when the product is fetched with a pricing context.
    const calc = variant.calculated_price;
    if (calc?.currency_code && calc.calculated_amount != null
      && calc.calculated_price?.price_list_type === 'sale') {
      const currency = String(calc.currency_code).toUpperCase();
      prices.push({ amount: toMinor(calc.calculated_amount, currency), currency, kind: 'sale' });
    }
    return prices;
  },

  getStock: (doc) => {
    const variant = doc.variants?.[0];
    if (!variant) return { status: 'unknown' };
    if (variant.manage_inventory === false) return { status: 'in_stock' };
    const quantity = variant.inventory_quantity;
    if (quantity == null) return { status: 'unknown' };
    if (quantity > 0) return { status: 'in_stock', quantity };
    return { status: variant.allow_backorder ? 'backorder' : 'out_of_stock', quantity };
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

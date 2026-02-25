import type { NeutralProduct } from '../data/types';

/**
 * Convert cents (integer) to a WooCommerce-style decimal string.
 * e.g. 129900 -> "1299.00"
 */
function centsToDecimal(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Map a neutral product type to WooCommerce's type field.
 * WooCommerce doesn't have a 'giftcard' type, so we map it to 'simple'.
 */
function mapType(type: NeutralProduct['type']): string {
  if (type === 'giftcard') return 'simple';
  return type;
}

/**
 * Transform a NeutralProduct into a WooCommerce REST API product shape.
 *
 * The resulting object is designed to pass through `wooProductTraits`
 * accessors correctly -- this is the primary quality gate for correctness.
 *
 * @param product - The neutral product from our catalog
 * @param wooId  - A numeric WooCommerce product ID to assign
 */
export function toWooProduct(product: NeutralProduct, wooId: number) {
  const primaryVariant = product.variants[0];
  const hasCompareAt = primaryVariant.compareAtPrice !== null;

  // When on sale, WooCommerce uses:
  //   regular_price = the original (higher) price
  //   sale_price    = the current discounted price
  //   price         = the effective price (same as sale_price when on sale)
  const price = centsToDecimal(primaryVariant.price);
  const regularPrice = hasCompareAt
    ? centsToDecimal(primaryVariant.compareAtPrice!)
    : price;
  const salePrice = hasCompareAt ? price : '';

  return {
    id: wooId,
    name: product.name,
    slug: product.slug,
    type: mapType(product.type),
    description: product.description,
    short_description: product.shortDescription,
    sku: primaryVariant.sku,
    price,
    regular_price: regularPrice,
    sale_price: salePrice,
    on_sale: hasCompareAt,
    images: product.images.map((img, idx) => ({
      id: idx + 1,
      src: img.url,
      alt: img.alt,
    })),
    categories: product.categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
    })),
    stock_status: primaryVariant.stockStatus,
    stock_quantity: primaryVariant.stockQuantity,
    manage_stock: primaryVariant.trackInventory,
    weight: primaryVariant.weight ? String(primaryVariant.weight) : '',
    barcode: primaryVariant.barcode,
    date_created: product.createdAt,
    date_modified: product.updatedAt,
  };
}

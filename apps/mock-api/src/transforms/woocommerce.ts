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
 * The WooCommerce schema requires integer category ids, but the neutral
 * catalog's category ids are slugs (e.g. `cat-equipment`). Assign each a
 * stable integer, first-seen order, so the same category always maps to
 * the same id within a process.
 */
const wooCategoryIds = new Map<string, number>();
function wooCategoryId(neutralId: string): number {
  let id = wooCategoryIds.get(neutralId);
  if (id === undefined) {
    id = wooCategoryIds.size + 1;
    wooCategoryIds.set(neutralId, id);
  }
  return id;
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
    // The WooCommerce RxDB schema keys on the string `uuid`, and the
    // connector's pull stores REST rows unchanged, so the mock serves one.
    uuid: `woo-${wooId}`,
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
      id: wooCategoryId(cat.id),
      name: cat.name,
      slug: cat.slug,
    })),
    stock_status: primaryVariant.stockStatus,
    stock_quantity: primaryVariant.stockQuantity,
    manage_stock: primaryVariant.trackInventory,
    barcode: primaryVariant.barcode,
    // `weight`, `date_created(_gmt)` and `date_modified` aren't in the
    // WooCommerce RxDB schema — only `date_modified_gmt` is.
    date_modified_gmt: product.updatedAt,
  };
}

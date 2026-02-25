import type { NeutralProduct } from '../data/types';

/**
 * Convert cents (integer) to a Shopify-style decimal string.
 * e.g. 129900 -> "1299.00"
 */
function centsToDecimal(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Transform a NeutralProduct into a Shopify Admin REST API product shape.
 *
 * The resulting object is designed to pass through `shopifyProductTraits`
 * accessors correctly -- round-trip correctness is the primary quality gate.
 *
 * Key Shopify shape differences:
 * - `title` instead of `name`
 * - `body_html` for description (wrapped in `<p>` tags)
 * - `handle` instead of `slug`
 * - `product_type` from first category name
 * - `tags` as a comma-separated string
 * - `images[].src` instead of `images[].url`
 * - `image` shortcut to first image
 * - Prices as decimal strings on variants
 * - `compare_at_price` for sale items (null otherwise)
 * - Stock via `inventory_management`, `inventory_policy`, `inventory_quantity`
 * - Variant options via positional `option1`, `option2`, `option3`
 */
export function toShopifyProduct(product: NeutralProduct) {
  const optionKeys = getOptionKeys(product);

  const images = product.images.map((img, idx) => ({
    id: idx + 1,
    src: img.url,
    alt: img.alt,
  }));

  const firstImage =
    images.length > 0 ? { src: images[0].src, alt: images[0].alt } : null;

  return {
    id: product.id,
    title: product.name,
    body_html: product.description ? `<p>${product.description}</p>` : '',
    vendor: 'Mock Coffee Co.',
    product_type: product.categories.length > 0 ? product.categories[0].name : '',
    handle: product.slug,
    status: 'active' as const,
    tags: product.tags.map((t) => t.name).join(', '),

    images,
    image: firstImage,

    variants: product.variants.map((variant) => {
      const hasCompareAt = variant.compareAtPrice !== null;
      const price = centsToDecimal(variant.price);
      const compareAtPrice = hasCompareAt
        ? centsToDecimal(variant.compareAtPrice!)
        : null;

      // Map positional option values
      const optionValues = optionKeys.map((key) => variant.options[key] ?? null);

      return {
        id: variant.id,
        title: variant.name,
        sku: variant.sku,
        barcode: variant.barcode,
        price,
        compare_at_price: compareAtPrice,
        inventory_management: variant.trackInventory ? 'shopify' : null,
        inventory_policy: variant.stockStatus === 'onbackorder' ? 'continue' : 'deny',
        inventory_quantity: variant.stockQuantity,
        weight: variant.weight,
        option1: optionValues[0] ?? null,
        option2: optionValues[1] ?? null,
        option3: optionValues[2] ?? null,
      };
    }),

    updated_at: product.updatedAt,
    created_at: product.createdAt,
  };
}

/**
 * Collect the distinct option keys across all variants, maintaining
 * insertion order. Shopify maps options positionally:
 *   option1, option2, option3
 */
function getOptionKeys(product: NeutralProduct): string[] {
  const keys: string[] = [];
  for (const variant of product.variants) {
    for (const key of Object.keys(variant.options)) {
      if (!keys.includes(key)) {
        keys.push(key);
      }
    }
  }
  return keys;
}

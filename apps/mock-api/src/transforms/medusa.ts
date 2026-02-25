import type { NeutralProduct } from '../data/types';

/**
 * Convert a neutral catalog ID (e.g. `prod-espresso-machine`) to a
 * Medusa-style ID with underscore prefix (e.g. `prod_espresso-machine`).
 *
 * Medusa IDs use `prod_` as the prefix separator.
 */
function toMedusaId(neutralId: string): string {
  // Neutral IDs look like "prod-something", replace first hyphen with underscore
  return neutralId.replace(/^prod-/, 'prod_');
}

/**
 * Transform a NeutralProduct into a Medusa v2 Admin API product shape.
 *
 * The resulting object is designed to pass through `medusaProductTraits`
 * accessors correctly -- round-trip correctness is the primary quality gate.
 *
 * Key Medusa shape differences from WooCommerce:
 * - `title` instead of `name`
 * - `handle` instead of `slug`
 * - `thumbnail` set from first image URL
 * - `images[].url` instead of `images[].src`
 * - `tags[].value` instead of `tags[].name`
 * - `categories[].handle` field present
 * - Prices as integer cents on `variants[].prices[].amount`
 * - Stock fields (`manage_inventory`, `allow_backorder`, `inventory_quantity`) on variants
 * - `is_giftcard` boolean for gift card products
 */
export function toMedusaProduct(product: NeutralProduct) {
  const thumbnail =
    product.images.length > 0 ? product.images[0].url : null;

  return {
    id: toMedusaId(product.id),
    title: product.name,
    handle: product.slug,
    description: product.description,
    is_giftcard: product.type === 'giftcard',
    thumbnail,

    images: product.images.map((img) => ({
      url: img.url,
    })),

    tags: product.tags.map((tag) => ({
      id: tag.id,
      value: tag.name,
    })),

    categories: product.categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      handle: cat.slug,
    })),

    variants: product.variants.map((variant) => ({
      id: variant.id,
      title: variant.name,
      sku: variant.sku,
      barcode: variant.barcode,
      ean: null,
      upc: null,
      manage_inventory: variant.trackInventory,
      allow_backorder: variant.stockStatus === 'onbackorder',
      inventory_quantity: variant.stockQuantity,
      prices: [
        {
          amount: variant.price,
          currency_code: 'usd',
        },
      ],
      options: variant.options,
    })),

    created_at: product.createdAt,
    updated_at: product.updatedAt,
  };
}

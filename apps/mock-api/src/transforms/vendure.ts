import type { NeutralProduct } from '../data/types';

/**
 * Map neutral stock status to Vendure's SCREAMING_SNAKE_CASE stockLevel.
 *
 * Vendure Shop API returns stockLevel as:
 *   'IN_STOCK' | 'OUT_OF_STOCK' | 'LOW_STOCK'
 */
function mapStockLevel(
  status: NeutralProduct['variants'][number]['stockStatus'],
): string {
  if (status === 'instock') return 'IN_STOCK';
  if (status === 'outofstock') return 'OUT_OF_STOCK';
  // onbackorder maps to OUT_OF_STOCK in Vendure (no native backorder concept)
  return 'OUT_OF_STOCK';
}

/**
 * Strip the `prod-` prefix from a neutral ID to produce a bare Vendure-style ID.
 * e.g. `prod-espresso-machine` -> `espresso-machine`
 */
function toVendureId(neutralId: string): string {
  return neutralId.replace(/^prod-/, '');
}

/**
 * Transform a NeutralProduct into a Vendure Admin/Shop API product shape.
 *
 * The resulting object is designed to pass through `vendureProductTraits`
 * accessors correctly -- round-trip correctness is the primary quality gate.
 *
 * Key Vendure shape differences:
 * - `name` (same as WooCommerce, not `title`)
 * - `slug` for the URL slug
 * - `description` as plain text
 * - `enabled` boolean
 * - `featuredAsset`: `{ id, preview }` or null
 * - `assets[]`: `{ id, preview }` (field is `preview`, not `src` or `url`)
 * - `collections[]`: `{ id, name, slug }` (Vendure's categories)
 * - `facetValues[]` for tags
 * - `variants[].priceWithTax`: integer cents (inc. tax)
 * - `variants[].price`: integer cents (excl. tax, ~90% of priceWithTax)
 * - `variants[].currencyCode`: 'USD'
 * - `variants[].stockLevel`: 'IN_STOCK' | 'OUT_OF_STOCK' | 'LOW_STOCK'
 * - `variants[].stockOnHand`: number
 * - `variants[].trackInventory`: 'TRUE' | 'FALSE' (strings, not booleans)
 * - `variants[].customFields.barcode`: string or null
 * - `variants[].options[]`: `{ id, name, code }`
 * - `updatedAt`: ISO string (camelCase)
 */
export function toVendureProduct(product: NeutralProduct) {
  const featuredAsset =
    product.images.length > 0
      ? { id: `asset-${product.slug}-0`, preview: product.images[0].url }
      : null;

  const assets = product.images.map((img, idx) => ({
    id: `asset-${product.slug}-${idx}`,
    preview: img.url,
  }));

  return {
    id: toVendureId(product.id),
    name: product.name,
    slug: product.slug,
    description: product.description,
    enabled: true,

    featuredAsset,
    assets,

    collections: product.categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
    })),

    facetValues: product.tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      code: tag.name.toLowerCase().replace(/\s+/g, '-'),
      facet: { id: 'facet-tags', name: 'Tags', code: 'tags' },
    })),

    variants: product.variants.map((variant) => {
      const optionEntries = Object.entries(variant.options);
      return {
        id: variant.id,
        name: variant.name,
        sku: variant.sku,
        priceWithTax: variant.price,
        price: Math.round(variant.price * 0.9),
        currencyCode: 'USD',
        stockLevel: mapStockLevel(variant.stockStatus),
        stockOnHand: variant.stockQuantity,
        trackInventory: variant.trackInventory ? 'TRUE' : 'FALSE',
        customFields: {
          barcode: variant.barcode,
        },
        options: optionEntries.map(([key, value], idx) => ({
          id: `opt-${key.toLowerCase().replace(/\s+/g, '-')}-${idx}`,
          name: value,
          code: value.toLowerCase().replace(/\s+/g, '-'),
        })),
      };
    }),

    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

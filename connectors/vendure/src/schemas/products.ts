import type { RxJsonSchema } from 'rxdb';

/**
 * RxDB schema for Vendure products.
 *
 * Mirrors the Vendure GraphQL Admin API product shape. Key differences:
 * - Uses `name` (like WooCommerce, unlike Medusa's `title`)
 * - Prices are integers in cents on `variants[].priceWithTax`
 * - Images use `assets[].preview` and `featuredAsset.preview`
 * - Categories are `collections[].name`
 * - Stock level is a string (`IN_STOCK`, `OUT_OF_STOCK`, `LOW_STOCK`)
 * - No native barcode field (custom fields only)
 */
export const vendureProductSchema: RxJsonSchema<any> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    name: { type: 'string' },
    slug: { type: 'string', maxLength: 255 },
    description: { type: 'string' },
    enabled: { type: 'boolean' },
    featuredAsset: {
      type: ['object', 'null'],
      properties: {
        id: { type: 'string' },
        preview: { type: 'string' },
      },
    },
    assets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          preview: { type: 'string' },
        },
      },
    },
    collections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          slug: { type: 'string' },
        },
      },
    },
    facetValues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          code: { type: 'string' },
          facet: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
            },
          },
        },
      },
    },
    variants: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          sku: { type: 'string' },
          price: { type: 'number' },
          priceWithTax: { type: 'number' },
          currencyCode: { type: 'string' },
          stockLevel: { type: 'string' },
          stockOnHand: { type: 'number' },
          trackInventory: { type: 'string' },
          featuredAsset: {
            type: ['object', 'null'],
            properties: {
              id: { type: 'string' },
              preview: { type: 'string' },
            },
          },
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                code: { type: 'string' },
              },
            },
          },
          customFields: { type: 'object' },
        },
      },
    },
    updatedAt: { type: 'string', maxLength: 50 },
  },
  required: ['id'],
  indexes: ['slug', 'updatedAt'],
};

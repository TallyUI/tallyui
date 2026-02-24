import type { RxJsonSchema } from 'rxdb';

/**
 * MedusaJS v2 Product RxDB schema.
 * Mirrors the Medusa Admin API product shape.
 *
 * Key differences from WooCommerce:
 * - `title` instead of `name`
 * - `handle` instead of `slug`
 * - Pricing lives on variants, not the product itself
 * - Variants have their own SKU, barcode, images
 * - Categories use `name`, but products/collections use `title`
 * - Tags use `value` field
 * - Images have `url` (not `src`)
 */
export const medusaProductSchema: RxJsonSchema<any> = {
  title: 'Medusa Product',
  version: 0,
  type: 'object',
  primaryKey: 'id',
  properties: {
    id: {
      type: 'string',
      maxLength: 200,
    },
    title: {
      type: 'string',
    },
    handle: {
      type: 'string',
    },
    subtitle: {
      type: ['string', 'null'],
    },
    description: {
      type: ['string', 'null'],
    },
    status: {
      type: 'string',
      enum: ['draft', 'proposed', 'published', 'rejected'],
      default: 'draft',
    },
    thumbnail: {
      type: ['string', 'null'],
    },
    is_giftcard: {
      type: 'boolean',
      default: false,
    },
    discountable: {
      type: 'boolean',
      default: true,
    },
    collection_id: {
      type: ['string', 'null'],
    },
    type_id: {
      type: ['string', 'null'],
    },
    external_id: {
      type: ['string', 'null'],
    },
    weight: {
      type: ['number', 'null'],
    },
    length: {
      type: ['number', 'null'],
    },
    height: {
      type: ['number', 'null'],
    },
    width: {
      type: ['number', 'null'],
    },
    origin_country: {
      type: ['string', 'null'],
    },
    hs_code: {
      type: ['string', 'null'],
    },
    mid_code: {
      type: ['string', 'null'],
    },
    material: {
      type: ['string', 'null'],
    },
    metadata: {
      type: ['object', 'null'],
    },
    categories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          handle: { type: 'string' },
        },
      },
    },
    tags: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          value: { type: 'string' },
        },
      },
    },
    images: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          url: { type: 'string' },
          rank: { type: 'number' },
        },
      },
    },
    options: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          values: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                value: { type: 'string' },
              },
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
          title: { type: ['string', 'null'] },
          sku: { type: ['string', 'null'] },
          barcode: { type: ['string', 'null'] },
          ean: { type: ['string', 'null'] },
          upc: { type: ['string', 'null'] },
          allow_backorder: { type: ['boolean', 'null'] },
          manage_inventory: { type: ['boolean', 'null'] },
          inventory_quantity: { type: ['number', 'null'] },
          variant_rank: { type: ['number', 'null'] },
          weight: { type: ['number', 'null'] },
          length: { type: ['number', 'null'] },
          height: { type: ['number', 'null'] },
          width: { type: ['number', 'null'] },
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                value: { type: 'string' },
              },
            },
          },
          prices: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                currency_code: { type: 'string' },
                amount: { type: 'number' },
                min_quantity: { type: ['number', 'null'] },
                max_quantity: { type: ['number', 'null'] },
              },
            },
          },
        },
      },
    },
    created_at: {
      type: ['string', 'null'],
    },
    updated_at: {
      type: ['string', 'null'],
    },
  },
  indexes: ['handle', 'status'],
  required: ['id'],
};

import type { RxJsonSchema } from 'rxdb';

/**
 * WooCommerce Product RxDB schema.
 * Closely mirrors the WooCommerce REST API product shape.
 * Ported from @wcpos/database.
 */
export const wooProductSchema: RxJsonSchema<any> = {
  title: 'WooCommerce Product',
  version: 0,
  type: 'object',
  primaryKey: 'uuid',
  properties: {
    uuid: {
      type: 'string',
      maxLength: 36,
    },
    id: {
      type: 'integer',
      multipleOf: 1,
      minimum: 0,
      maximum: 2147483647,
    },
    name: {
      type: 'string',
    },
    slug: {
      type: 'string',
    },
    type: {
      type: 'string',
      default: 'simple',
      enum: ['simple', 'grouped', 'external', 'variable'],
    },
    status: {
      type: 'string',
      default: 'publish',
      enum: ['draft', 'pending', 'private', 'publish'],
    },
    sku: {
      type: 'string',
    },
    barcode: {
      type: 'string',
      maxLength: 255,
    },
    price: {
      type: 'string',
    },
    regular_price: {
      type: 'string',
    },
    sale_price: {
      type: 'string',
    },
    on_sale: {
      type: 'boolean',
    },
    description: {
      type: 'string',
    },
    short_description: {
      type: 'string',
    },
    stock_quantity: {
      type: ['number', 'null'],
    },
    stock_status: {
      type: 'string',
      default: 'instock',
      enum: ['instock', 'outofstock', 'onbackorder', 'lowstock'],
      maxLength: 255,
    },
    manage_stock: {
      type: 'boolean',
      default: false,
    },
    categories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          slug: { type: 'string' },
        },
      },
    },
    tags: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          slug: { type: 'string' },
        },
      },
    },
    images: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          src: { type: 'string' },
          name: { type: 'string' },
          alt: { type: 'string' },
        },
      },
    },
    attributes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          position: { type: 'integer' },
          visible: { type: 'boolean' },
          variation: { type: 'boolean' },
          options: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
    variations: {
      type: 'array',
      items: { type: 'integer' },
    },
    meta_data: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          key: { type: 'string' },
          value: { type: 'string' },
        },
      },
    },
    date_modified_gmt: {
      type: 'string',
    },
  },
  indexes: ['id', 'barcode', 'stock_status'],
  required: ['uuid'],
};

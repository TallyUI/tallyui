import type { RxJsonSchema } from 'rxdb';

/**
 * RxDB schema for Shopify products.
 *
 * Mirrors the Shopify Admin REST API product shape. Key difference from
 * WooCommerce: price, SKU, barcode, and inventory live on variants, not
 * the product itself. Even single-option products have one variant.
 */
export const shopifyProductSchema: RxJsonSchema<any> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    title: { type: 'string' },
    body_html: { type: 'string' },
    vendor: { type: 'string' },
    product_type: { type: 'string' },
    handle: { type: 'string', maxLength: 255 },
    status: {
      type: 'string',
      enum: ['active', 'archived', 'draft'],
    },
    tags: { type: 'string' },
    published_scope: { type: 'string' },
    variants: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          title: { type: 'string' },
          price: { type: 'string' },
          compare_at_price: { type: ['string', 'null'] },
          sku: { type: ['string', 'null'] },
          barcode: { type: ['string', 'null'] },
          position: { type: 'number' },
          inventory_policy: { type: 'string' },
          inventory_management: { type: ['string', 'null'] },
          inventory_quantity: { type: 'number' },
          option1: { type: ['string', 'null'] },
          option2: { type: ['string', 'null'] },
          option3: { type: ['string', 'null'] },
          weight: { type: 'number' },
          weight_unit: { type: 'string' },
          taxable: { type: 'boolean' },
          requires_shipping: { type: 'boolean' },
        },
      },
    },
    options: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          name: { type: 'string' },
          position: { type: 'number' },
          values: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
    images: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          src: { type: 'string' },
          alt: { type: ['string', 'null'] },
          position: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
        },
      },
    },
    image: {
      type: ['object', 'null'],
      properties: {
        src: { type: 'string' },
      },
    },
    updated_at: { type: 'string', maxLength: 50 },
  },
  required: ['id'],
  indexes: ['handle', 'status', 'updated_at'],
};

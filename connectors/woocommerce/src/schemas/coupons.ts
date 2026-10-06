import type { RxJsonSchema } from 'rxdb';

/**
 * WooCommerce Coupon RxDB schema (ADR-077 amendment 2).
 * Mirrors the coupon listing; the catalogue reconcile is its only source.
 */
export const wooCouponSchema: RxJsonSchema<any> = {
  title: 'WooCommerce Coupon',
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
    code: {
      type: 'string',
      maxLength: 255,
    },
    status: {
      type: 'string',
    },
    amount: {
      type: 'string',
    },
    discount_type: {
      type: 'string',
    },
    description: {
      type: 'string',
    },
    date_created: {
      type: 'string',
    },
    date_created_gmt: {
      type: 'string',
    },
    date_modified: {
      type: 'string',
    },
    date_modified_gmt: {
      type: 'string',
    },
    minimum_amount: {
      type: 'string',
    },
    maximum_amount: {
      type: 'string',
    },
    date_expires: {
      type: ['string', 'null'],
    },
    date_expires_gmt: {
      type: ['string', 'null'],
    },
    usage_count: {
      type: 'integer',
    },
    usage_limit: {
      type: ['integer', 'null'],
    },
    usage_limit_per_user: {
      type: ['integer', 'null'],
    },
    limit_usage_to_x_items: {
      type: ['integer', 'null'],
    },
    individual_use: {
      type: 'boolean',
    },
    free_shipping: {
      type: 'boolean',
    },
    exclude_sale_items: {
      type: 'boolean',
    },
    product_ids: {
      type: 'array',
      items: { type: 'integer' },
    },
    excluded_product_ids: {
      type: 'array',
      items: { type: 'integer' },
    },
    product_categories: {
      type: 'array',
      items: { type: 'integer' },
    },
    excluded_product_categories: {
      type: 'array',
      items: { type: 'integer' },
    },
    email_restrictions: {
      type: 'array',
      items: { type: 'string' },
    },
    used_by: {
      type: 'array',
      items: { type: 'string' },
    },
    meta_data: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          key: { type: 'string' },
          value: {},
        },
      },
    },
  },
  indexes: ['code'],
  required: ['uuid'],
};

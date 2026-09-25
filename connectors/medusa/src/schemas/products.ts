import type { RxJsonSchema } from 'rxdb';

/** A store API variant's `calculated_price`: the fields the connector reads. Amounts are major units. */
export interface MedusaCalculatedPrice {
  calculated_amount: number | null;
  original_amount: number | null;
  currency_code: string;
  is_calculated_price_tax_inclusive: boolean;
  is_original_price_tax_inclusive: boolean;
  calculated_price?: { price_list_id?: string | null; price_list_type?: string | null };
}

/** A stored variant. `calculated_price`: an object when priced, `null` when not sold here, undefined in base-only mode. */
export interface MedusaVariantDocument {
  id: string;
  prices?: Array<{ amount: number; currency_code: string; price_list_id?: string | null }>;
  calculated_price?: MedusaCalculatedPrice | null;
  [field: string]: unknown;
}

/** A stored product; typed for the fields the pricing code reads. */
export interface MedusaProductDocument {
  id: string;
  status?: string;
  variants?: MedusaVariantDocument[];
  [field: string]: unknown;
}

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
  // 1: declares `variants[].calculated_price` (backlog 44). A bump drops and resyncs (ConnectorSchemas).
  version: 1,
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
    // Indexed fields must be required strings with a maxLength (RxDB SC34).
    handle: {
      type: 'string',
      maxLength: 255,
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
      maxLength: 20,
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
          // Admin base prices.
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
          // The store API's price (D2b), as `MedusaCalculatedPrice`: an object in priced mode,
          // `null` when the sales channel or region does not sell the variant, and absent in
          // base-only mode, with no pricing context. No `additionalProperties: false`: the store
          // API sends more fields (`id`, `original_price`) and can add others.
          calculated_price: {
            type: ['object', 'null'],
            properties: {
              calculated_amount: { type: ['number', 'null'] },
              original_amount: { type: ['number', 'null'] },
              currency_code: { type: 'string' },
              is_calculated_price_tax_inclusive: { type: ['boolean', 'null'] },
              is_original_price_tax_inclusive: { type: ['boolean', 'null'] },
              calculated_price: {
                type: 'object',
                properties: {
                  price_list_id: { type: ['string', 'null'] },
                  price_list_type: { type: ['string', 'null'] },
                },
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
  required: ['id', 'handle', 'status'],
};

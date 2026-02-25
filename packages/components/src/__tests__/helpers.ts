import type { TallyConnector } from '@tallyui/core';
import { wooProductTraits } from '@tallyui/connector-woocommerce';
import { medusaProductTraits } from '@tallyui/connector-medusa';
import { products } from '@tallyui/mock-api/data';
import { toWooProduct, toMedusaProduct } from '@tallyui/mock-api/transforms';

/**
 * Sample WooCommerce product document for component tests.
 * Generated from the shared mock catalog.
 */
export const wooDoc = toWooProduct(products[0], 1);

/**
 * Sample MedusaJS product document for component tests.
 * Generated from the shared mock catalog.
 */
export const medusaDoc = toMedusaProduct(products[0]);

/**
 * Builds a minimal TallyConnector with real product traits
 * for either WooCommerce or Medusa.
 */
export function createTestConnector(type: 'woo' | 'medusa'): TallyConnector {
  const traits = type === 'woo' ? wooProductTraits : medusaProductTraits;

  return {
    id: type,
    name: type === 'woo' ? 'WooCommerce' : 'MedusaJS',
    description: `Test ${type} connector`,
    auth: {
      type: 'none',
      fields: [],
      getHeaders: () => ({}),
    },
    schemas: {
      products: {
        version: 0,
        primaryKey: 'id',
        type: 'object',
        properties: { id: { type: 'string', maxLength: 100 } },
        required: ['id'],
      },
    },
    traits: {
      product: traits,
    },
    sync: {
      products: {
        fetchAllIds: async () => [],
        fetchByIds: async () => [],
      },
    },
  };
}

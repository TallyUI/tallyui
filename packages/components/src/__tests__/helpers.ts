import type { TallyConnector, CustomerTraits } from '@tallyui/core';
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
 * Sample WooCommerce customer document for component tests.
 */
export const wooCustomerDoc = {
  id: 1,
  first_name: 'Jane',
  last_name: 'Smith',
  email: 'jane@example.com',
  billing: {
    address_1: '123 Main St',
    city: 'Springfield',
    state: 'IL',
    postcode: '62701',
  },
};

/**
 * Sample MedusaJS customer document for component tests.
 */
export const medusaCustomerDoc = {
  id: 'cus_01H',
  first_name: 'Jane',
  last_name: 'Smith',
  email: 'jane@example.com',
  addresses: [{
    address_1: '123 Main St',
    city: 'Springfield',
    province: 'IL',
    postal_code: '62701',
  }],
};

const wooCustomerTraits: CustomerTraits = {
  getId: (doc) => String(doc.id),
  getName: (doc) => [doc.first_name, doc.last_name].filter(Boolean).join(' ') || 'Guest',
  getEmail: (doc) => doc.email || undefined,
  getPhone: (doc) => doc.billing?.phone || undefined,
  getAddressSummary: (doc) => {
    const b = doc.billing;
    if (!b?.address_1) return undefined;
    return [b.address_1, b.city, b.state].filter(Boolean).join(', ');
  },
};

const medusaCustomerTraits: CustomerTraits = {
  getId: (doc) => doc.id,
  getName: (doc) => [doc.first_name, doc.last_name].filter(Boolean).join(' ') || 'Guest',
  getEmail: (doc) => doc.email || undefined,
  getPhone: (doc) => doc.phone || undefined,
  getAddressSummary: (doc) => {
    const a = doc.addresses?.[0];
    if (!a?.address_1) return undefined;
    return [a.address_1, a.city, a.province].filter(Boolean).join(', ');
  },
};

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
      customer: type === 'woo' ? wooCustomerTraits : medusaCustomerTraits,
    },
    sync: {
      products: {
        fetchAllIds: async () => [],
        fetchByIds: async () => [],
      },
    },
  };
}

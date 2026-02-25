import type { TallyConnector, CustomerTraits } from '@tallyui/core';
import { wooProductTraits } from '@tallyui/connector-woocommerce';
import { medusaProductTraits } from '@tallyui/connector-medusa';

/**
 * Sample WooCommerce product document for component tests.
 */
export const wooDoc = {
  id: 42,
  name: 'Espresso Machine Pro',
  sku: 'ESP-001',
  price: '599.99',
  regular_price: '599.99',
  sale_price: '',
  on_sale: false,
  stock_status: 'instock',
  stock_quantity: 15,
  barcode: '1234567890123',
  images: [{ id: 1, src: 'https://store.example/espresso.jpg', alt: '' }],
  categories: [{ id: 1, name: 'Equipment', slug: 'equipment' }],
};

/**
 * Sample MedusaJS product document for component tests.
 */
export const medusaDoc = {
  id: 'prod_01H',
  title: 'Commercial Espresso Machine',
  handle: 'commercial-espresso-machine',
  status: 'published',
  thumbnail: 'https://cdn.example/thumb-espresso.jpg',
  description: 'High-end commercial espresso machine.',
  images: [{ id: 'img_01', url: 'https://cdn.example/espresso-full.jpg' }],
  categories: [{ id: 'pcat_01', name: 'Equipment' }],
  variants: [
    {
      id: 'var_01',
      sku: 'MED-ESP-001',
      barcode: '9876543210001',
      inventory_quantity: 8,
      manage_inventory: true,
      allow_backorder: false,
      prices: [{ currency_code: 'usd', amount: 89900 }],
    },
  ],
};

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

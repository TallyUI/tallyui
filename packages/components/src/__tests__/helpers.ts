import type { TallyConnector } from '@tallyui/core';
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

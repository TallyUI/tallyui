import type { TallyConnector } from '@tallyui/core';

import { shopifyProductSchema } from './schemas/products';
import { shopifyProductTraits } from './traits/product';
import { shopifyProductSync } from './sync/products';
import { shopifyProductReplication } from './replication/products';

/**
 * Shopify connector for Tally UI.
 *
 * Connects to Shopify stores via the Admin REST API.
 * Products are stored in RxDB using a schema that mirrors the Shopify API shape.
 *
 * ```ts
 * import { shopifyConnector } from '@tallyui/connector-shopify';
 * import { ConnectorProvider } from '@tallyui/core';
 *
 * <ConnectorProvider connector={shopifyConnector}>
 *   <App />
 * </ConnectorProvider>
 * ```
 */
export const shopifyConnector: TallyConnector = {
  id: 'shopify',
  name: 'Shopify',
  description: 'Connect to Shopify stores via the Admin REST API',
  icon: undefined,

  auth: {
    type: 'Shopify Admin API',
    fields: [
      {
        key: 'store',
        label: 'Store Name',
        type: 'text',
        placeholder: 'my-store (from my-store.myshopify.com)',
        required: true,
      },
      {
        key: 'access_token',
        label: 'Access Token',
        type: 'password',
        placeholder: 'shpat_...',
        required: true,
      },
    ],
    getHeaders: (credentials) => ({
      'X-Shopify-Access-Token': credentials.access_token,
      'Content-Type': 'application/json',
    }),
  },

  schemas: {
    products: shopifyProductSchema,
  },

  traits: {
    product: shopifyProductTraits,
  },

  sync: {
    products: shopifyProductSync,
  },

  replication: {
    products: shopifyProductReplication,
  },
};

// Re-export pieces for advanced usage
export { shopifyProductSchema } from './schemas/products';
export { shopifyProductTraits } from './traits/product';
export { shopifyProductSync } from './sync/products';
export { shopifyProductReplication } from './replication/products';

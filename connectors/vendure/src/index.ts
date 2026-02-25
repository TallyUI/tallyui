import type { TallyConnector } from '@tallyui/core';

import { vendureProductSchema } from './schemas/products';
import { vendureProductTraits } from './traits/product';
import { vendureProductSync } from './sync/products';
import { vendureProductReplication } from './replication/products';

/**
 * Vendure connector for Tally UI.
 *
 * Connects to Vendure backends via the Admin GraphQL API.
 * Products are stored in RxDB using a schema that mirrors the Vendure API shape.
 *
 * ```ts
 * import { vendureConnector } from '@tallyui/connector-vendure';
 * import { ConnectorProvider } from '@tallyui/core';
 *
 * <ConnectorProvider connector={vendureConnector}>
 *   <App />
 * </ConnectorProvider>
 * ```
 */
export const vendureConnector: TallyConnector = {
  id: 'vendure',
  name: 'Vendure',
  description: 'Connect to Vendure backends via the Admin GraphQL API',
  icon: undefined,

  auth: {
    type: 'Vendure Admin API',
    fields: [
      {
        key: 'url',
        label: 'Backend URL',
        type: 'url',
        placeholder: 'https://my-vendure-server.com',
        required: true,
      },
      {
        key: 'auth_token',
        label: 'Auth Token',
        type: 'password',
        placeholder: 'vendure-auth-token from login',
        required: true,
      },
    ],
    getHeaders: (credentials) => ({
      Authorization: `Bearer ${credentials.auth_token}`,
    }),
  },

  schemas: {
    products: vendureProductSchema,
  },

  traits: {
    product: vendureProductTraits,
  },

  sync: {
    products: vendureProductSync,
  },

  replication: {
    products: vendureProductReplication,
  },
};

// Re-export pieces for advanced usage
export { vendureProductSchema } from './schemas/products';
export { vendureProductTraits } from './traits/product';
export { vendureProductSync } from './sync/products';
export { vendureProductReplication } from './replication/products';

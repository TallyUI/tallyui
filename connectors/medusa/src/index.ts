import type { TallyConnector } from '@tallyui/core';

import { medusaProductSchema } from './schemas/products';
import { medusaProductTraits } from './traits/product';
import { medusaProductSync } from './sync/products';
import { medusaProductReplication } from './replication/products';

/**
 * MedusaJS v2 connector for Tally UI.
 *
 * Connects to Medusa backends via the Admin API.
 * Products are stored in RxDB using a schema that mirrors the Medusa API shape.
 *
 * ```ts
 * import { medusaConnector } from '@tallyui/connector-medusa';
 * import { ConnectorProvider } from '@tallyui/core';
 *
 * <ConnectorProvider connector={medusaConnector}>
 *   <App />
 * </ConnectorProvider>
 * ```
 */
export const medusaConnector: TallyConnector = {
  id: 'medusa',
  name: 'MedusaJS',
  description: 'Connect to MedusaJS v2 backends via the Admin API',
  icon: undefined, // TODO: Medusa logo

  auth: {
    type: 'Medusa Admin API',
    fields: [
      {
        key: 'url',
        label: 'Backend URL',
        type: 'url',
        placeholder: 'https://my-medusa-backend.com',
        required: true,
      },
      {
        key: 'api_token',
        label: 'API Token',
        type: 'password',
        placeholder: 'Your admin API token',
        required: true,
      },
    ],
    getHeaders: (credentials) => ({
      Authorization: `Bearer ${credentials.api_token}`,
    }),
  },

  schemas: {
    products: medusaProductSchema,
  },

  traits: {
    product: medusaProductTraits,
  },

  sync: {
    products: medusaProductSync,
  },

  replication: {
    products: medusaProductReplication,
  },
};

// Re-export pieces for advanced usage
export { medusaProductSchema } from './schemas/products';
export { medusaProductTraits } from './traits/product';
export { medusaProductSync } from './sync/products';
export { medusaProductReplication } from './replication/products';

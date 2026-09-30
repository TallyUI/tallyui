import { ConnectorUnauthorizedError, type TallyConnector } from '@tallyui/core';

import { wooProductSchema } from './schemas/products';
import { wooProductTraits } from './traits/product';
import { wooProductSync } from './sync/products';
import { wooProductReplication } from './replication/products';

export class WooMissingTokenError extends ConnectorUnauthorizedError {
  constructor() {
    super('WooCommerce credentials have no WCPOS access token: sign in again');
    this.name = 'WooMissingTokenError';
  }
}

/**
 * WooCommerce connector for Tally UI.
 *
 * Requires the WCPOS Free plugin 1.10.0 or later. SyncContext.baseUrl must
 * be the store's wcpos/v2 root: <site>/wp-json/wcpos/v2.
 * Products are stored in RxDB using a schema that mirrors the WC API shape.
 *
 * ```ts
 * import { woocommerceConnector } from '@tallyui/connector-woocommerce';
 * import { ConnectorProvider } from '@tallyui/core';
 *
 * <ConnectorProvider connector={woocommerceConnector}>
 *   <App />
 * </ConnectorProvider>
 * ```
 */
export const woocommerceConnector: TallyConnector = {
  id: 'woocommerce',
  name: 'WooCommerce',
  description: 'Connect to WooCommerce stores via the REST API',
  icon: undefined, // TODO: WooCommerce logo

  auth: {
    type: 'WCPOS token',
    fields: [
      {
        key: 'url',
        label: 'Store URL',
        type: 'url',
        placeholder: 'https://mystore.com',
        required: true,
      },
      {
        key: 'token',
        label: 'Access token',
        type: 'password',
        required: true,
      },
    ],
    getHeaders: (credentials) => {
      if (typeof credentials.token !== 'string' || credentials.token.length === 0) {
        throw new WooMissingTokenError();
      }
      return {
        Authorization: `Bearer ${credentials.token}`,
        'X-WCPOS': '1',
      };
    },
  },

  schemas: {
    products: wooProductSchema,
  },

  traits: {
    product: wooProductTraits,
  },

  sync: {
    products: wooProductSync,
  },

  replication: {
    products: wooProductReplication,
  },
};

// Re-export pieces for advanced usage
export { ConnectorUnauthorizedError } from '@tallyui/core';
export { wooProductSchema } from './schemas/products';
export { wooProductTraits } from './traits/product';
export { wooProductSync } from './sync/products';
export { wooProductReplication, WooDateFilterError, WooMissingUuidError } from './replication/products';

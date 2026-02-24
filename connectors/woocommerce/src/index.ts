import type { TallyConnector } from '@tallyui/core';

import { wooProductSchema } from './schemas/products';
import { wooProductTraits } from './traits/product';
import { wooProductSync } from './sync/products';

/**
 * WooCommerce connector for Tally UI.
 *
 * Connects to WooCommerce sites via the REST API (v3) or WCPOS API.
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
    type: 'WooCommerce REST API',
    fields: [
      {
        key: 'url',
        label: 'Store URL',
        type: 'url',
        placeholder: 'https://mystore.com',
        required: true,
      },
      {
        key: 'consumer_key',
        label: 'Consumer Key',
        type: 'text',
        placeholder: 'ck_...',
        required: true,
      },
      {
        key: 'consumer_secret',
        label: 'Consumer Secret',
        type: 'password',
        placeholder: 'cs_...',
        required: true,
      },
    ],
    getHeaders: (credentials) => {
      const encoded = btoa(`${credentials.consumer_key}:${credentials.consumer_secret}`);
      return {
        Authorization: `Basic ${encoded}`,
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
};

// Re-export pieces for advanced usage
export { wooProductSchema } from './schemas/products';
export { wooProductTraits } from './traits/product';
export { wooProductSync } from './sync/products';

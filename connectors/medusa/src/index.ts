import type { ConnectorAuth, TallyConnector } from '@tallyui/core';

import { medusaProductSchema } from './schemas/products';
import { medusaProductTraits } from './traits/product';
import { medusaProductSync } from './sync/products';
import { medusaProductReplication } from './replication/products';

export const medusaSecretKeyAuth: ConnectorAuth = {
  type: 'Medusa Admin API',
  fields: [
    { key: 'url', label: 'Backend URL', type: 'url', placeholder: 'https://my-medusa-backend.com', required: true },
    { key: 'api_token', label: 'Secret API Key', type: 'password', placeholder: 'sk_...', required: true },
  ],
  // Medusa v2 only accepts secret API keys over HTTP Basic auth, with the
  // key as the username and an empty password. Bearer is for user JWTs.
  getHeaders: (credentials) => ({ Authorization: `Basic ${btoa(`${credentials.api_token}:`)}` }),
};

// The JWT from Medusa's emailpass sign-in (POST /auth/user/emailpass) is stored as token.
// email and password are only sign-in form fields and are never sent as headers.
export const medusaAdminUserAuth: ConnectorAuth = {
  type: 'Medusa admin user (Bearer JWT)',
  fields: [
    { key: 'url', label: 'Backend URL', type: 'url', placeholder: 'https://my-medusa-backend.com', required: true },
    { key: 'email', label: 'Email', type: 'text', required: true },
    { key: 'password', label: 'Password', type: 'password', required: true },
  ],
  getHeaders: (credentials): Record<string, string> => typeof credentials.token === 'string' && credentials.token.length > 0
    ? { Authorization: `Bearer ${credentials.token}` } : {},
};

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

  auth: medusaSecretKeyAuth,

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

/** Medusa connector using an admin user's Bearer JWT. */
export const medusaAdminUserConnector: TallyConnector = { ...medusaConnector, auth: medusaAdminUserAuth };

// Re-export pieces for advanced usage
export { medusaProductSchema } from './schemas/products';
export { medusaProductTraits } from './traits/product';
export { medusaProductSync } from './sync/products';
export { medusaProductReplication } from './replication/products';

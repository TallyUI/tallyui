import { SignInError, type ConnectorAuth, type TallyConnector } from '@tallyui/core';

import { medusaProductSchema } from './schemas/products';
import { medusaProductTraits } from './traits/product';
import { medusaProductSync } from './sync/products';
import { medusaProductReplication } from './replication/products';
import { medusaStockReconcile } from './reconcile/stock';

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

// Reads exp from a JWT payload without verifying it: for display and refresh timing only.
const jwtExpiresAt = (token: string): string | undefined => {
  try {
    const part = token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')));
    return typeof exp === 'number' ? new Date(exp * 1000).toISOString() : undefined;
  } catch { return undefined; }
};

export const medusaSignIn: NonNullable<ConnectorAuth['signIn']> = async (baseUrl, { email, password }, init = {}) => {
  const doFetch = init.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${baseUrl}/auth/user/emailpass`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: init.signal,
      body: JSON.stringify({ email, password }),
    });
  } catch (error) {
    if ((error as { name?: unknown })?.name === 'AbortError' || init.signal?.aborted) throw error;
    throw new SignInError('failed', `Could not reach Medusa at ${baseUrl}: ${error instanceof Error ? error.message : String(error)}`);
  }
  let body: { token?: unknown; location?: string; message?: string; mfa_required?: unknown; verification_required?: unknown } = {};
  let bodyUnparseable = false;
  try {
    const parsed: unknown = await res.json();
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed;
    else bodyUnparseable = true;
  } catch {
    bodyUnparseable = true;
  }
  if (res.status === 401) throw new SignInError('invalid_credentials', body.message ?? 'Invalid email or password');
  if (bodyUnparseable) throw new SignInError('server_error', `Medusa sent an unreadable response (HTTP ${res.status})`, res.status);
  // A location, MFA or verification requirement is a sign-in flow this connector can't do.
  // Never return a token from a body like this, even if one is present.
  if (body.location) throw new SignInError('unsupported', `Medusa wants to continue sign-in at ${body.location}; only email and password are supported`);
  if (body.mfa_required === true) throw new SignInError('unsupported', 'Medusa requires multi-factor authentication, which this connector does not support');
  if (body.verification_required === true) throw new SignInError('unsupported', 'Medusa requires email verification, which this connector does not support');
  if (!res.ok) throw new SignInError('server_error', body.message ?? `Medusa sign-in failed (HTTP ${res.status})`, res.status);
  if (typeof body.token !== 'string') throw new SignInError('server_error', `Medusa sign-in response had no token (HTTP ${res.status})`, res.status);
  return { token: body.token, expiresAt: jwtExpiresAt(body.token) };
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
  signIn: medusaSignIn,
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

  reconcile: {
    stock: medusaStockReconcile,
  },
};

/** Medusa connector using an admin user's Bearer JWT. */
export const medusaAdminUserConnector: TallyConnector = { ...medusaConnector, auth: medusaAdminUserAuth };

// Re-export pieces for advanced usage
export { medusaProductSchema } from './schemas/products';
export { medusaProductTraits } from './traits/product';
export { medusaProductSync } from './sync/products';
export { medusaProductReplication } from './replication/products';
export { medusaStockReconcile } from './reconcile/stock';

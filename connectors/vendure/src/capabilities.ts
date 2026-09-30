import { ConnectorUnauthorizedError, parseInfoCapabilities, type ServerCapabilities } from '@tallyui/core';

import { signedOut } from './session-probe';

/** The plugin's capability endpoint on Vendure's REST server (ADR-062), relative to the base URL. */
export const CAPABILITIES_PATH = '/tally/v1/info';

/**
 * Reads the store's contract capabilities (ADR-062) and `taxRounding` (#287) with the
 * connector's own headers. A 2xx gives `parseInfoCapabilities`; a 404 or a non-JSON body
 * means no plugin and gives `{ orderCreate: 1 }`; a network failure, a 5xx or any other
 * non-2xx is unknown and gives `undefined`. The route answers a dead session and a missing
 * `CreateOrder` permission alike with 403, so a 401/403 asks who is signed in (#279): nobody
 * throws `ConnectorUnauthorizedError`, an administrator throws a plain Error naming the
 * permission, and a failed check is unknown.
 */
export async function readVendureCapabilities(
  baseUrl: string,
  headers: Record<string, string>,
  init: { fetch?: typeof fetch; signal?: AbortSignal } = {},
): Promise<ServerCapabilities | undefined> {
  const doFetch = init.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${baseUrl}${CAPABILITIES_PATH}`, { method: 'GET', headers, signal: init.signal });
  } catch {
    return undefined;
  }
  if (res.status === 401 || res.status === 403) {
    const out = await signedOut({ connectorId: 'vendure', baseUrl, headers, signal: init.signal });
    // The probe confirms sign-out; the route's 403 also covers missing permissions.
    if (out === true) throw new ConnectorUnauthorizedError(`Vendure refused ${CAPABILITIES_PATH}: the session is signed out`, 401);
    if (out === false) throw new Error(`Vendure refused ${CAPABILITIES_PATH} although the session is signed in: the CreateOrder permission is missing (HTTP ${res.status})`);
    return undefined;
  }
  if (res.status === 404) return { orderCreate: 1 };
  if (!res.ok) return undefined;
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { orderCreate: 1 };
  }
  return parseInfoCapabilities(body, (reason) => console.warn(`@tallyui/connector-vendure: ${reason}`));
}

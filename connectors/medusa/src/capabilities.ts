import { parseInfoCapabilities, SignInError, type ServerCapabilities } from '@tallyui/core';

/** Path of Medusa's own contract-capability endpoint (ADR-062), relative to the backend's base URL. */
export const CAPABILITIES_PATH = '/tally/v1/info';

/**
 * Reads the store's contract capabilities (ADR-062) and `taxRounding` (#287), with the
 * connector's usual injectable `fetch`. A 2xx gives `parseInfoCapabilities`; a 2xx with the field missing/malformed, a non-JSON body, or a 404
 * both mean an old plugin and give `{ orderCreate: 1 }`. A network failure,
 * a 5xx or any other non-2xx that isn't 404/401 is unknown and gives
 * `undefined`, never 1. A 401 means rejected/expired credentials and throws.
 */
export async function readCapabilities(
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
  if (res.status === 401) throw new SignInError('invalid_credentials', `Medusa rejected the credentials reading capabilities (HTTP 401)`);
  if (res.status === 404) return { orderCreate: 1 };
  if (!res.ok) return undefined;
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { orderCreate: 1 };
  }
  return parseInfoCapabilities(body, (reason) => console.warn(`@tallyui/connector-medusa: ${reason}`));
}

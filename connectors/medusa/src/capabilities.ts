import { parseInfoCapabilities, SignInError, type ServerCapabilities } from '@tallyui/core';

/** Path of Medusa's own contract-capability endpoint (ADR-062), relative to the backend's base URL. */
export const CAPABILITIES_PATH = '/tally/v1/info';

/**
 * Reads the store's contract capabilities (ADR-062) and `taxRounding` (#287), with the
 * connector's usual injectable `fetch`. A 404 means an old plugin and gives the default;
 * a network failure, non-2xx other than 404/401, non-JSON 2xx or malformed `taxRounding`
 * is unknown and gives `undefined`. A 401 means rejected/expired credentials and throws.
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
    return undefined;
  }
  return parseInfoCapabilities(body, (reason) => console.warn(`@tallyui/connector-medusa: ${reason}`));
}

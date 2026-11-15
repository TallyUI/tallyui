import { ConnectorUnauthorizedError } from '@tallyui/core';
import type { SyncContext } from '@tallyui/core';

/**
 * GETs an Admin API path (with its query string) and returns the JSON body. A 401 or 403
 * throws ConnectorUnauthorizedError, any other non-2xx an Error, both with the message
 * `Medusa API error: <status>[: <body message>]`.
 */
export async function adminGet(path: string, context: SyncContext) {
  const response = await fetch(`${context.baseUrl}${path}`, {
    headers: { ...context.headers, 'Content-Type': 'application/json' },
    signal: context.signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message = `Medusa API error: ${response.status}${error?.message ? `: ${error.message}` : ''}`;
    if (response.status === 401 || response.status === 403) throw new ConnectorUnauthorizedError(message, response.status as 401 | 403);
    throw new Error(message);
  }
  return response.json();
}

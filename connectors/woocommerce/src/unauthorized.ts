import { ConnectorUnauthorizedError } from '@tallyui/core';

/** Throws `ConnectorUnauthorizedError` when the store refused the credentials (401/403); `what` names the resource in the message. */
export function throwIfUnauthorized(response: Response | undefined, what: string): void {
  if (response?.status === 401 || response?.status === 403) {
    throw new ConnectorUnauthorizedError(`WooCommerce ${what}: HTTP ${response.status}`, response.status);
  }
}

import { ConnectorUnauthorizedError } from '@tallyui/core';
import type { SyncContext } from '@tallyui/core';

/**
 * Vendure answers a dead session and a missing permission alike: HTTP 200 with GraphQL
 * `FORBIDDEN` (#274). Asks who is signed in with the failed request's headers: `true` when
 * nobody is, `false` when an administrator is, `undefined` when the check itself failed.
 */
export async function signedOut(context: SyncContext): Promise<boolean | undefined> {
  try {
    const res = await fetch(`${context.baseUrl}/admin-api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...context.headers },
      body: JSON.stringify({ query: 'query { activeAdministrator { id } }' }),
      signal: context.signal,
    });
    if (!res.ok) return undefined;
    const body = await res.json() as { data?: { activeAdministrator?: { id?: unknown } | null }; errors?: unknown[] };
    if (body.errors?.length) return undefined;
    if (body.data?.activeAdministrator === null) return true;
    return body.data?.activeAdministrator?.id != null ? false : undefined;
  } catch (error) {
    if (context.signal?.aborted) throw error;
    return undefined;
  }
}

/**
 * The error for a `FORBIDDEN` answer: only a signed-out session signs the till out. The plain
 * errors name what was refused (the GraphQL `path`, e.g. `product.variants`) for the store owner's log.
 */
export async function forbiddenError(context: SyncContext, forbidden: { message?: string; path?: ReadonlyArray<string | number> }): Promise<Error> {
  const out = await signedOut(context);
  const { message } = forbidden;
  if (out === true) return new ConnectorUnauthorizedError(`Vendure GraphQL error: ${message}`);
  const what = forbidden.path?.length ? `${forbidden.path.join('.')}: ${message}` : message;
  if (out === false) return new Error(`Vendure GraphQL error: FORBIDDEN: the store refused this request although the session is signed in (a permission is missing): ${what}`);
  return new Error(`Vendure GraphQL error: FORBIDDEN: ${what} (the session check failed, so this may be transient)`);
}

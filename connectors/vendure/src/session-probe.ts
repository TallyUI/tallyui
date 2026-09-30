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
 * The error for a `FORBIDDEN` answer: a signed-out session is 401, a confirmed missing permission
 * is 403, and a failed probe is a plain Error. Errors name everything refused in answer order (each GraphQL `path`, e.g. `product.variants`),
 * for the store owner's log. One probe answers for the whole response.
 */
export async function forbiddenError(context: SyncContext, forbidden: Array<{ message?: string; path?: ReadonlyArray<string | number> }>): Promise<Error> {
  const out = await signedOut(context);
  // The probe confirmed a signed-out session even though Vendure answered FORBIDDEN.
  if (out === true) return new ConnectorUnauthorizedError(`Vendure GraphQL error: ${forbidden[0].message}`, 401);
  const what = forbidden.map(({ message, path }) => (path?.length ? `${path.join('.')}: ${message}` : message)).join('; ');
  if (out === false) return new ConnectorUnauthorizedError(`Vendure GraphQL error: FORBIDDEN: the store refused this request although the session is signed in (a permission is missing): ${what}`, 403);
  return new Error(`Vendure GraphQL error: FORBIDDEN: ${what} (the session check failed, so this may be transient)`);
}

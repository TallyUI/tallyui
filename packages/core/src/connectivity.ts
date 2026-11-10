import type { TallyConnector } from './types/connector';

/**
 * How well a connector's store answers (v2 parity A6, unit 34). The same three states as WCPOS v2's
 * `EngineConnectivity`: `degraded` means the device is online but the store keeps failing.
 */
export type ConnectivityState = 'online' | 'offline' | 'degraded';

/**
 * A store's deliberate refusal to sync until someone updates software. `fixedBy` as in `SyncNotice`: `'till'` when
 * this app is older than the store accepts, `'store'` when the store's software is older than the app needs.
 * `reason` is the connector's code for it; `software`, `minVersion` and `status` only when the refusal names them.
 */
export type UpdateRequired = { reason: string; fixedBy: 'till' | 'store'; software?: string; minVersion?: string; status?: number };

/** What one failed request says: about connectivity, an update-required refusal, or nothing (`null`). */
export type FailureClass = 'offline' | 'degraded' | { updateRequired: UpdateRequired } | null;

const isAbort = (name: unknown) => name === 'AbortError' || name === 'TimeoutError';

/**
 * For a connector's fetch call site alone: `fetch(url, init).catch(noResponse)`. A fetch that rejects got no response,
 * but its `TypeError` looks like one our own code throws, so the call site tags it: rethrown as a `NoResponseError`
 * with `code: 'network'` (offline to `neutralFailureClass`) and the original as `cause`. An abort or timeout is
 * rethrown unchanged. Code that reads the response runs after the catch, so its errors are never tagged.
 */
export function noResponse(error: unknown): never {
  if (isAbort((error as { name?: unknown } | null)?.name)) throw error;
  throw Object.assign(new Error('No response from the store'), { name: 'NoResponseError', code: 'network', cause: error });
}

/** Node's socket and DNS error codes for a request that got no response; Node's fetch puts them on `cause.code`. */
const NO_RESPONSE_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'ENETDOWN']);

/**
 * The rule for a connector without `classifyFailure`: a timeout or a 5xx is `degraded`; a request that got no
 * response (`code: 'network'`, as `noResponse` and `CustomerServiceError` set, or a no-response socket code on the
 * error or its `cause`) is `offline`; anything else is `null`, a bare `TypeError` included, since our own code throws
 * those too. It never answers update-required: only a connector knows its own refusal.
 */
export function neutralFailureClass(error: unknown): FailureClass {
  if (typeof error !== 'object' || error === null) return null;
  const { name, code, status, cause } = error as { name?: unknown; code?: unknown; status?: unknown; cause?: unknown };
  if (isAbort(name) || code === 'timeout') return 'degraded';
  if (typeof status === 'number' && status >= 500) return 'degraded';
  if (code === 'network') return 'offline';
  const causeCode = (cause as { code?: unknown } | null | undefined)?.code;
  return NO_RESPONSE_CODES.has(code as string) || NO_RESPONSE_CODES.has(causeCode as string) ? 'offline' : null;
}

/** The connector's own `classifyFailure` when it has one (its answer is final), else `neutralFailureClass`. A method that throws gives `null`. */
export function classifyFailure(connector: Pick<TallyConnector, 'classifyFailure'> | undefined, error: unknown): FailureClass {
  if (!connector?.classifyFailure) return neutralFailureClass(error);
  try {
    return connector.classifyFailure(error);
  } catch {
    return null;
  }
}

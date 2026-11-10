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

/**
 * The rule for a connector without `classifyFailure`: a timeout or a 5xx is `degraded`, a request that got no
 * response (a fetch's `TypeError`, or a `network` code as `CustomerServiceError` has) is `offline`, anything else is
 * `null`. It never answers update-required: only a connector knows its own refusal.
 */
export function neutralFailureClass(error: unknown): FailureClass {
  if (typeof error !== 'object' || error === null) return null;
  const { name, code, status } = error as { name?: unknown; code?: unknown; status?: unknown };
  if (name === 'AbortError' || name === 'TimeoutError' || code === 'timeout') return 'degraded';
  if (typeof status === 'number' && status >= 500) return 'degraded';
  if (name === 'TypeError' || code === 'network') return 'offline';
  return null;
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

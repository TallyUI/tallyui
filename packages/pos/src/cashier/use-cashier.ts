import { useEffect, useMemo, useState } from 'react';
import { cashierPermissions } from '@tallyui/core';
import type { Cashier, CashierPermission, SyncContext, TallyConnector } from '@tallyui/core';
import { can } from './can';

export interface CashierState {
  /** The cashier with unknown permission names dropped; `null` while loading, after an error, with no `cashier()`, or when it resolved `null`. */
  cashier: Cashier | null;
  /** `can(cashier, permission)` once known; `false` while loading or after an error, so nothing flashes. */
  can: (permission: CashierPermission) => boolean;
  /** `cashier()` is in flight, or there is no connector or context yet. */
  loading: boolean;
  /** What `cashier()` rejected with; `undefined` otherwise. */
  error: unknown;
  /** For `useRegisterSession`'s `blind` option: `!can('viewReports')`, as v2's blind count. */
  blind: boolean;
  /** The Reports gate: `'pending'` while loading, `'allowed'` with `viewReports`, else `'denied'`. */
  reports: 'pending' | 'allowed' | 'denied';
}

type Read = { connector: TallyConnector; context: SyncContext } & (
  | { status: 'ready'; cashier: Cashier | null }
  | { status: 'error'; error: unknown }
);

const deny = () => false;
const LOADING: CashierState = { cashier: null, can: deny, loading: true, error: undefined, blind: true, reports: 'pending' };

function resolved(cashier: Cashier | null): CashierState {
  const reports = can(cashier, 'viewReports');
  return {
    cashier, can: (permission) => can(cashier, permission), loading: false, error: undefined,
    blind: !reports, reports: reports ? 'allowed' : 'denied',
  };
}

/**
 * The signed-in cashier's permissions (v2 parity A12): reads `connector.cashier(context)` on mount, and again when
 * `connector` or `context` changes by identity (memoise both); the last read wins. A connector without `cashier()`
 * allows everything at once, as before. While the read is in flight, and after it rejects, `can` is `false` and the
 * count is blind, so a blind cashier never sees figures flash; nothing is retried.
 *
 * ```tsx
 * const cashier = useCashier(connector, context);
 * const register = useRegisterSession({ ...options, blind: cashier.blind });
 * if (cashier.reports === 'denied') return <NoReportsAccess />;
 * ```
 */
export function useCashier(connector: TallyConnector | null, context: SyncContext | null): CashierState {
  const [read, setRead] = useState<Read | null>(null);

  useEffect(() => {
    if (!connector?.cashier || !context) return;
    let live = true;
    Promise.resolve().then(() => connector.cashier?.(context) ?? null).then(
      (cashier) => {
        if (live) setRead({
          connector, context, status: 'ready',
          cashier: cashier && { id: cashier.id, name: cashier.name, permissions: cashierPermissions(cashier.permissions) },
        });
      },
      (error: unknown) => {
        if (live) setRead({ connector, context, status: 'error', error });
      },
    );
    // Discards the in-flight read on a connector or context change, or unmount.
    return () => {
      live = false;
    };
  }, [connector, context]);

  return useMemo(() => {
    if (!connector || !context) return LOADING;
    if (!connector.cashier) return resolved(null);
    // A read for another connector or context is stale: the current one is still loading.
    if (!read || read.connector !== connector || read.context !== context) return LOADING;
    if (read.status === 'error')
      return { cashier: null, can: deny, loading: false, error: read.error, blind: true, reports: 'denied' };
    return resolved(read.cashier);
  }, [connector, context, read]);
}

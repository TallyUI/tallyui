/**
 * The closures list's pure selectors (ADR-032): a requested scope clamped to the local history
 * window, and its rows within that scope, newest first. Port provenance (ADR-032 amendment 1):
 * WCPOS `next` `3b5331b5c` `use-closure-rows.ts` — `ClosureScope`, `clampClosureScope` and
 * `selectClosureRows` only. The React hook that pages the server and merges local/remote rows is
 * registers job c, not ported here.
 */
import { businessDayOf } from './session-store';
import type { Closure } from './schemas';

export type ClosureScope = {
  from: string;
  to: string;
  registerId: string;
  storeKey?: string;
  cashier?: string;
};

/**
 * WCPOS's `HISTORY_DAYS` (`@wcpos/sync-core`) bounds how far back local report history reaches
 * without a server aggregation call. Its value is 92 (wcpos/roadmap#332, "the 92-day reach").
 */
const DEFAULT_HISTORY_DAYS = 92;

/** `day` minus `days` calendar days, both `yyyy-MM-dd`: calendar arithmetic, not a zone conversion. */
function daysBefore(day: string, days: number): string {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() - days);
  return at.toISOString().slice(0, 10);
}

/** Clamps a requested scope's `from`/`to` to `today` and to `historyDays` before it. */
export function clampClosureScope(
  scope: ClosureScope,
  today: string,
  historyDays = DEFAULT_HISTORY_DAYS,
): ClosureScope {
  const min = daysBefore(today, historyDays);
  const clamp = (day: string) => (day < min ? min : day > today ? today : day);
  return { ...scope, from: clamp(scope.from), to: clamp(scope.to) };
}

/**
 * Rows within `scope`, newest business day first, then newest `closed_at`. A row with no
 * `business_day` (a legacy or remote row) gets one from `opened_at` in `timezone`, reusing a2's
 * `businessDayOf` rather than duplicating it. Register and cashier are optional filters; the
 * store is not — a row's `store_key` must equal `scope.storeKey` (both `null` when neither is
 * set), as WCPOS always compared `store_id`.
 */
export function selectClosureRows(rows: readonly Closure[], scope: ClosureScope, timezone: string) {
  return rows
    .map((row) => ({
      ...row,
      business_day: row.business_day || businessDayOf(row.opened_at, timezone),
    }))
    .filter(
      (row) =>
        row.business_day >= scope.from &&
        row.business_day <= scope.to &&
        (!scope.registerId || row.register_id === scope.registerId) &&
        (row.store_key ?? null) === (scope.storeKey ?? null) &&
        (scope.cashier === undefined || row.closed_by === scope.cashier),
    )
    .sort((a, b) => b.business_day.localeCompare(a.business_day) || b.closed_at.localeCompare(a.closed_at));
}

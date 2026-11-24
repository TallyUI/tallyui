import { useEffect, useMemo, useState } from 'react';
import { StoreRefundsUnsupportedError } from '@tallyui/core';
import type { ListRefundsQuery, StoreOrder, StoreRefund, StoreRefundOrphan, StoreRefundPage, SyncContext, TallyConnector } from '@tallyui/core';
import type { DayRange, ReportRefund } from '../reports/types';
import { orderFiltersQuery } from '../sale/order-filters-query';
import type { OrderDownloadProgress } from './use-store-orders-in-range';

export interface StoreRefundsRangeQuery {
  /** The report's store days, inclusive. */
  range: DayRange;
  /** IANA zone of the store, or 'device' (as SalesFiguresInput.timezone). */
  timezone: string;
  /** The report's currency (StoreOrder.currency). A refund in any other currency is never counted. */
  currency: string;
  /** Set fields restrict the report; a refund counts only when its order carries the same value for every set field. */
  scope?: { storeId?: string; cashierId?: string; registerId?: string };
}
export interface OtherCurrencyRefunds { currency: string; count: number; amountMinor: number }
export interface StoreRefundsInRange {
  /** The counted refunds as report rows. undefined when the store has no dated refunds: the report then uses its orders' embedded refunds. */
  refunds: ReportRefund[] | undefined;
  orphans: StoreRefundOrphan[];
  unreadable: number;
  unscoped: StoreRefund[];
  otherCurrency: OtherCurrencyRefunds[];
  progress: OrderDownloadProgress | null;
  error: unknown | null;
  complete: boolean;
}

/** The most `ListRefundsQuery.perPage` allows. */
const PER_PAGE = 100;
/** The error a read ends with when a page says `hasMore: true` but adds no new refund or orphan id. */
const STALLED = 'listRefunds answered hasMore: true with a page that added no new refund';
const SCOPE_FIELDS = ['storeId', 'cashierId', 'registerId'] as const;

type Sorted = Pick<StoreRefundsInRange, 'orphans' | 'unscoped' | 'otherCurrency' | 'unreadable'> & { refunds: ReportRefund[] };
type Read = Sorted & {
  connector: TallyConnector;
  context: SyncContext;
  key: string;
  /** Distinct refund and orphan ids seen. */
  seen: number;
  total: number | null;
} & ({ status: 'reading' | 'complete' | 'unsupported' } | { status: 'error'; error: unknown });

const EMPTY = { orphans: [], unscoped: [], otherCurrency: [], unreadable: 0 };
const IDLE: StoreRefundsInRange = { ...EMPTY, refunds: undefined, progress: null, error: null, complete: false };
const NO_DATED: StoreRefundsInRange = { ...IDLE, complete: true };
const STARTING: StoreRefundsInRange = { ...EMPTY, refunds: [], progress: { downloaded: 0, total: null }, error: null, complete: false };

/** Calls `listRefunds` page after page, one at a time, until a page has `hasMore: false` or `live()` turns false. */
async function readPages(
  connector: TallyConnector,
  context: SyncContext,
  dateRange: ListRefundsQuery['dateRange'],
  live: () => boolean,
  onPage: (page: StoreRefundPage, first: boolean) => Promise<void>,
): Promise<void> {
  for (let page = 1; ; page++) {
    // Yield first so a read abandoned before its call (StrictMode's double effect) calls nothing.
    await Promise.resolve();
    if (!live()) return;
    const result = await connector.listRefunds!(context, { page, perPage: PER_PAGE, dateRange });
    if (!live()) return;
    await onPage(result, page === 1);
    if (!live() || !result.hasMore) return;
  }
}

/**
 * Every refund a store made in the report's store days, read online page by page from `listRefunds` (ADR-081
 * decision 7), as `useStoreOrdersInRange` reads orders (decision 6). Nothing is stored or cached.
 *
 * - Idle (`refunds: undefined`, `complete: false`, nothing called) without `connector`, `context` or `query`.
 * - No `connector.listRefunds`, or a page rejecting with `StoreRefundsUnsupportedError`: `refunds: undefined`,
 *   `complete: true`, so `salesFigures` uses the orders' embedded refunds.
 * - The read's `dateRange` is the store days' UTC bounds (`orderFiltersQuery`). While reading, `progress` is
 *   `{ downloaded, total }`: distinct refund and orphan ids plus `unreadable`, and page 1's `total` or `null`.
 * - One id set covers refunds and orphans; the first copy stays. `unreadable` sums page 1's and each later page's
 *   that adds a new id. A `hasMore: true` page that adds no new id stops the read with an `Error`.
 * - Each fresh refund is sorted into exactly one place, so none is in two of `refunds`, `unscoped`, `otherCurrency`
 *   and `orphans`. With a set `scope` field, each page's not-yet-asked orders are fetched with one `getOrders` call:
 *   an order not returned (or no `getOrders`) makes the refund `unscoped`; an order with a different value in any set
 *   field puts it outside the report, in no list; else an order missing a set field makes it `unscoped`. Then a
 *   refund in `query.currency` is counted in `refunds`, in the store's order; any other goes to `otherCurrency`, one
 *   row per currency, sorted by code. `orphans` are kept as they come. Only `refunds` is ever summed.
 * - A page with `hasMore: false`, its orders resolved, finishes: `complete: true`, `progress: null`. Any other
 *   rejection, from `listRefunds` or `getOrders`, stops the read: `error` is it, `progress` is `null`, what was
 *   counted stays.
 * - A `query` that differs by value, or a new `connector` or `context`, abandons the read and starts again from
 *   page 1, showing none of the old rows; an equal new object changes nothing. Unmounting abandons the read.
 *
 * Offset paging over a live store can repeat a row, which is dropped, or push a row past a page boundary mid-read,
 * which is then missed until the next read.
 */
export function useStoreRefundsInRange(
  connector: TallyConnector | null,
  context: SyncContext | null,
  query: StoreRefundsRangeQuery | null,
): StoreRefundsInRange {
  const key = query ? JSON.stringify(query) : null;
  const [read, setRead] = useState<Read | null>(null);

  useEffect(() => {
    if (!connector?.listRefunds || !context || key === null) return;
    const q = JSON.parse(key) as StoreRefundsRangeQuery;
    const scope = SCOPE_FIELDS.filter((field) => q.scope?.[field] !== undefined);
    let live = true;
    const seen = new Set<string>();
    const asked = new Set<string>();
    const orders = new Map<string, StoreOrder>();
    let current: Read = { connector, context, key, ...EMPTY, refunds: [], seen: 0, total: null, status: 'reading' };
    const take = (row: { id: string }) => !seen.has(row.id) && seen.add(row.id).has(row.id);
    const dateRange = orderFiltersQuery({ dateRange: q.range }, q.timezone).dateRange;
    readPages(connector, context, dateRange, () => live, async (page, first) => {
      const fresh = page.refunds.filter(take);
      const orphans = page.orphans.filter(take);
      if (page.hasMore && fresh.length + orphans.length === 0) throw new Error(STALLED);
      if (scope.length && connector.getOrders) {
        const ids = [...new Set(fresh.map((refund) => refund.orderId))].filter((id) => !asked.has(id));
        ids.forEach((id) => asked.add(id));
        if (ids.length) for (const order of await connector.getOrders(context, ids)) orders.set(order.id, order);
        if (!live) return;
      }
      const refunds = [...current.refunds];
      const unscoped = [...current.unscoped];
      const other = new Map(current.otherCurrency.map((row) => [row.currency, row]));
      for (const refund of fresh) {
        const order = orders.get(refund.orderId);
        if (scope.length) {
          if (order && scope.some((field) => order[field] !== undefined && order[field] !== q.scope![field])) continue;
          if (!order || scope.some((field) => order[field] === undefined)) { unscoped.push(refund); continue; }
        }
        if (refund.currency === q.currency) {
          refunds.push({ id: refund.id, orderId: refund.orderId, at: refund.refundedAt, amountMinor: refund.amountMinor });
          continue;
        }
        const row = other.get(refund.currency) ?? { currency: refund.currency, count: 0, amountMinor: 0 };
        other.set(refund.currency, { ...row, count: row.count + 1, amountMinor: row.amountMinor + refund.amountMinor });
      }
      current = {
        ...current, refunds, unscoped, orphans: [...current.orphans, ...orphans],
        otherCurrency: [...other.values()].sort((a, b) => (a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0)),
        unreadable: current.unreadable + (first || fresh.length + orphans.length > 0 ? (page.unreadable ?? 0) : 0),
        seen: seen.size, total: first ? (page.total ?? null) : current.total,
        status: page.hasMore ? 'reading' : 'complete',
      };
      setRead(current);
    }).catch((error: unknown) => {
      if (!live) return;
      current = error instanceof StoreRefundsUnsupportedError ? { ...current, status: 'unsupported' } : { ...current, status: 'error', error };
      setRead(current);
    });
    // Abandons the read in flight on a new connector, context or query value, or on unmount, and clears its published
    // value so a switch back cannot show it; the memo's check covers the render before this cleanup runs.
    return () => {
      live = false;
      setRead(null);
    };
  }, [connector, context, key]);

  return useMemo(() => {
    if (!connector || !context || key === null) return IDLE;
    if (!connector.listRefunds) return NO_DATED;
    // A read for another connector, context or query is stale: the current one is only starting.
    if (!read || read.connector !== connector || read.context !== context || read.key !== key) return STARTING;
    if (read.status === 'unsupported') return NO_DATED;
    const { refunds, orphans, unreadable, unscoped, otherCurrency, seen, total } = read;
    const progress = read.status === 'reading' ? { downloaded: seen + unreadable, total } : null;
    const error = read.status === 'error' ? read.error : null;
    return { refunds, orphans, unreadable, unscoped, otherCurrency, progress, error, complete: read.status === 'complete' };
  }, [connector, context, key, read]);
}

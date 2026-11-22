import { useEffect, useMemo, useState } from 'react';
import type { ListOrdersQuery, StoreOrder, StoreOrderPage, SyncContext, TallyConnector } from '@tallyui/core';

/** Progress of one ranged read; null when idle, finished, failed or aborted. */
export interface OrderDownloadProgress { downloaded: number; total: number | null }

export interface StoreOrdersInRange {
  orders: StoreOrder[];
  progress: OrderDownloadProgress | null;
  unreadable: number;
  error: unknown | null;
  complete: boolean;
}

export type StoreOrdersRangeQuery = Omit<ListOrdersQuery, 'page' | 'perPage'>;

/** The most `ListOrdersQuery.perPage` allows. */
const PER_PAGE = 100;
/** The error a read ends with when a page says `hasMore: true` but adds no new order id. */
const STALLED = 'listOrders answered hasMore: true with a page that added no new order';

type Read = {
  connector: TallyConnector;
  context: SyncContext;
  key: string;
  orders: StoreOrder[];
  unreadable: number;
  total: number | null;
} & ({ status: 'reading' | 'complete' } | { status: 'error'; error: unknown });

const IDLE: StoreOrdersInRange = { orders: [], progress: null, unreadable: 0, error: null, complete: false };
const STARTING: StoreOrdersInRange = {
  orders: [], progress: { downloaded: 0, total: null }, unreadable: 0, error: null, complete: false,
};

/** Calls `listOrders` page after page, one at a time, until a page has `hasMore: false` or `live()` turns false. */
async function readPages(
  connector: TallyConnector,
  context: SyncContext,
  query: StoreOrdersRangeQuery,
  live: () => boolean,
  onPage: (page: StoreOrderPage, first: boolean) => void,
): Promise<void> {
  for (let page = 1; ; page++) {
    // Yield first so a read abandoned before its call (StrictMode's double effect) calls nothing. A synchronous
    // throw from `listOrders` still counts as a rejection, since this is an async function.
    await Promise.resolve();
    if (!live()) return;
    const result = await connector.listOrders!(context, { ...query, page, perPage: PER_PAGE });
    if (!live()) return;
    onPage(result, page === 1);
    if (!result.hasMore) return;
  }
}

/**
 * Every store order matching `query`, read online page by page (ADR-081 decision 6). Nothing is stored or cached.
 *
 * - Idle (`progress: null`, nothing called) without `connector`, `context`, `query` or `connector.listOrders`.
 * - `progress` is `{ downloaded, total }` while pages are fetched: `{ downloaded: 0, total: null }` until the first
 *   page lands, then `total` is that page's `total` (`null` when the store gives no count) and stays fixed for the
 *   read. `downloaded` is always `orders.length + unreadable`.
 * - Orders are deduplicated by id as pages land; the first copy stays. `unreadable` sums the `unreadable` of the first
 *   page and of each later page that adds a new order id; a later page that adds none adds nothing to it.
 * - A page with `hasMore: false` finishes: `complete: true`, `progress: null`, `orders` in `listOrders`' own order.
 * - A rejection stops the read: `error` is what was thrown, `progress` is `null`, the orders read so far stay.
 * - A page with `hasMore: true` that adds no new order id also stops the read, with an `Error`, even when it reports
 *   unreadable orders, so a store that keeps repeating a page stops.
 * - A `query` that differs by value, or a new `connector` or `context`, abandons the read and starts again from
 *   page 1, showing none of the old orders; an equal new object changes nothing. Unmounting abandons the read.
 *   So keep `connector` and `context` the same objects across renders: a new object each render restarts the read on
 *   every render.
 *
 * Offset paging over a live store can repeat a row, which is dropped, or push a row past a page boundary mid-read,
 * which is then missed until the next read. Nothing is cached, so opening the screen again corrects it.
 */
export function useStoreOrdersInRange(
  connector: TallyConnector | null,
  context: SyncContext | null,
  query: StoreOrdersRangeQuery | null,
): StoreOrdersInRange {
  const key = query ? JSON.stringify(query) : null;
  const [read, setRead] = useState<Read | null>(null);

  useEffect(() => {
    if (!connector?.listOrders || !context || key === null) return;
    let live = true;
    const seen = new Set<string>();
    let current: Read = { connector, context, key, orders: [], unreadable: 0, total: null, status: 'reading' };
    const publish = (next: Read) => {
      current = next;
      setRead(next);
    };
    readPages(connector, context, JSON.parse(key) as StoreOrdersRangeQuery, () => live, (page, first) => {
      const fresh = page.orders.filter((order) => {
        if (seen.has(order.id)) return false;
        seen.add(order.id);
        return true;
      });
      if (page.hasMore && fresh.length === 0) throw new Error(STALLED);
      publish({
        ...current,
        orders: [...current.orders, ...fresh],
        unreadable: current.unreadable + (first || fresh.length > 0 ? (page.unreadable ?? 0) : 0),
        total: first ? (page.total ?? null) : current.total,
        status: page.hasMore ? 'reading' : 'complete',
      });
    }).catch((error: unknown) => {
      if (live) publish({ ...current, status: 'error', error });
    });
    // Abandons the read in flight on a new connector, context or query value, or on unmount, and clears its published
    // value so a switch back cannot show it; the memo's check covers the render before this cleanup runs.
    return () => {
      live = false;
      setRead(null);
    };
  }, [connector, context, key]);

  return useMemo(() => {
    if (!connector?.listOrders || !context || key === null) return IDLE;
    // A read for another connector, context or query is stale: the current one is only starting.
    if (!read || read.connector !== connector || read.context !== context || read.key !== key) return STARTING;
    const { orders, unreadable, total } = read;
    const progress = read.status === 'reading' ? { downloaded: orders.length + unreadable, total } : null;
    return { orders, progress, unreadable, error: read.status === 'error' ? read.error : null, complete: read.status === 'complete' };
  }, [connector, context, key, read]);
}

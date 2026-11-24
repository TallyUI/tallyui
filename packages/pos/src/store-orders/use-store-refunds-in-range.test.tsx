import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { StoreRefundsUnsupportedError } from '@tallyui/core';
import type { StoreOrder, StoreRefund, StoreRefundOrphan, StoreRefundPage, SyncContext, TallyConnector } from '@tallyui/core';
import { useStoreRefundsInRange, type StoreRefundsRangeQuery } from './use-store-refunds-in-range';

const context: SyncContext = { connectorId: 'fake', baseUrl: 'https://store.test', headers: {} };
const query: StoreRefundsRangeQuery = { range: { from: '2026-11-10', to: '2026-11-11' }, timezone: 'UTC', currency: 'USD' };
const EMPTY = { orphans: [], unreadable: 0, unscoped: [], otherCurrency: [], progress: null, error: null };
const IDLE = { ...EMPTY, refunds: undefined, complete: false };
const NO_DATED = { ...EMPTY, refunds: undefined, complete: true };
const STARTING = { ...EMPTY, refunds: [], progress: { downloaded: 0, total: null }, complete: false };
const STALLED = 'listRefunds answered hasMore: true with a page that added no new refund';
const AT = '2026-11-10T10:00:00.000Z';
const refund = (id: string, orderId = 'A', amountMinor = 100, currency = 'USD'): StoreRefund =>
  ({ id, orderId, refundedAt: AT, currency, amountMinor });
const orphan = (id: string): StoreRefundOrphan => ({ id, orderId: 'X', refundedAt: AT });
const page = (refunds: StoreRefund[], rest: Partial<StoreRefundPage> = {}): StoreRefundPage =>
  ({ refunds, orphans: [], hasMore: false, ...rest });
const storeOrder = (id: string, registerId?: string) => ({ id, registerId }) as StoreOrder;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

function fakeConnector(pages: Promise<StoreRefundPage>[], orders?: StoreOrder[] | (() => Promise<StoreOrder[]>)[]) {
  const listRefunds = vi.fn(() => pages.shift() ?? new Promise<StoreRefundPage>(() => {}));
  const getOrders = vi.fn(async (_context: SyncContext, ids: readonly string[]) => {
    const next = orders?.[0];
    if (typeof next === 'function') return (orders as (() => Promise<StoreOrder[]>)[]).shift()!();
    return (orders as StoreOrder[]).filter((order) => ids.includes(order.id));
  });
  const connector = (orders ? { listRefunds, getOrders } : { listRefunds }) as unknown as TallyConnector;
  return { listRefunds, getOrders, connector };
}

const ids = (rows: { id: string }[] | undefined) => rows?.map((row) => row.id);
const render = (connector: TallyConnector, q: StoreRefundsRangeQuery = query) =>
  renderHook(() => useStoreRefundsInRange(connector, context, q));

describe('useStoreRefundsInRange', () => {
  it("H1 reads page 1 over the report's store days as UTC bounds", async () => {
    const { listRefunds, connector } = fakeConnector([]);
    render(connector, { ...query, timezone: 'Europe/Berlin' });
    await waitFor(() => expect(listRefunds).toHaveBeenCalledTimes(1));
    expect(listRefunds).toHaveBeenCalledWith(context, {
      page: 1, perPage: 100, dateRange: { after: '2026-11-09T23:00:00.000Z', before: '2026-11-11T23:00:00.000Z' },
    });
  });

  it('H2 pages, keeps the first copy of a refund or orphan id, and reports progress', async () => {
    const page2 = deferred<StoreRefundPage>();
    const { listRefunds, connector } = fakeConnector([
      Promise.resolve(page([refund('r1'), refund('r2', 'B', 200)], { orphans: [orphan('o1')], hasMore: true, total: 6 })),
      page2.promise,
    ]);
    const { result } = render(connector);
    expect(result.current).toEqual(STARTING);
    await waitFor(() => expect(result.current.progress).toEqual({ downloaded: 3, total: 6 }));

    await act(async () => page2.resolve(page([refund('r2', 'B', 999), refund('r3')], { orphans: [orphan('o1'), orphan('o2')] })));
    expect(result.current.refunds).toEqual([
      { id: 'r1', orderId: 'A', at: AT, amountMinor: 100 },
      { id: 'r2', orderId: 'B', at: AT, amountMinor: 200 },
      { id: 'r3', orderId: 'A', at: AT, amountMinor: 100 },
    ]);
    expect(ids(result.current.orphans)).toEqual(['o1', 'o2']);
    expect(result.current).toMatchObject({ progress: null, complete: true, error: null });
    expect(listRefunds).toHaveBeenNthCalledWith(2, context, expect.objectContaining({ page: 2, perPage: 100 }));
  });

  it('H3 counts only the report currency and sums the others per currency', async () => {
    const { connector } = fakeConnector([Promise.resolve(page([
      refund('e1', 'A', 250, 'EUR'), refund('g1', 'A', 100, 'GBP'), refund('u1', 'A', 500), refund('e2', 'A', 500, 'EUR'),
    ]))]);
    const { result } = render(connector);
    await waitFor(() => expect(result.current.complete).toBe(true));
    expect(ids(result.current.refunds)).toEqual(['u1']);
    expect(result.current.otherCurrency).toEqual([
      { currency: 'EUR', count: 2, amountMinor: 750 }, { currency: 'GBP', count: 1, amountMinor: 100 },
    ]);
  });

  it('H4 counts a scoped refund only when its order matches; a missing order or field is unscoped', async () => {
    const { getOrders, connector } = fakeConnector(
      [Promise.resolve(page([refund('rA', 'A'), refund('rB', 'B'), refund('rC', 'C'), refund('rD', 'D'), refund('rA2', 'A')]))],
      [storeOrder('A', '5'), storeOrder('B', '6'), storeOrder('C')],
    );
    const { result } = render(connector, { ...query, scope: { registerId: '5' } });
    await waitFor(() => expect(result.current.complete).toBe(true));
    expect(getOrders).toHaveBeenCalledTimes(1);
    expect(getOrders).toHaveBeenCalledWith(context, ['A', 'B', 'C', 'D']);
    expect(ids(result.current.refunds)).toEqual(['rA', 'rA2']);
    expect(ids(result.current.unscoped)).toEqual(['rC', 'rD']);
    expect(result.current.otherCurrency).toEqual([]);
  });

  it('H4b puts a refund outside the report when one set field differs, even with another missing', async () => {
    const { connector } = fakeConnector(
      [Promise.resolve(page([refund('rP', 'P'), refund('rQ', 'Q'), refund('rR', 'R')]))],
      [{ id: 'P', storeId: '2' } as StoreOrder, { id: 'Q', storeId: '1' } as StoreOrder,
        { id: 'R', storeId: '1', registerId: '5' } as StoreOrder],
    );
    const { result } = render(connector, { ...query, scope: { storeId: '1', registerId: '5' } });
    await waitFor(() => expect(result.current.complete).toBe(true));
    expect(ids(result.current.refunds)).toEqual(['rR']);
    expect(ids(result.current.unscoped)).toEqual(['rQ']);
  });

  it('H4c applies the scope before the currency', async () => {
    const { connector } = fakeConnector(
      [Promise.resolve(page([refund('e6', 'S6', 250, 'EUR'), refund('eN', 'SN', 300, 'EUR'), refund('e5', 'S5', 400, 'EUR')]))],
      [storeOrder('S6', '6'), storeOrder('SN'), storeOrder('S5', '5')],
    );
    const { result } = render(connector, { ...query, scope: { registerId: '5' } });
    await waitFor(() => expect(result.current.complete).toBe(true));
    expect(result.current.refunds).toEqual([]);
    expect(ids(result.current.unscoped)).toEqual(['eN']);
    expect(result.current.otherCurrency).toEqual([{ currency: 'EUR', count: 1, amountMinor: 400 }]);
  });

  it('H5 asks for each order once per read', async () => {
    const { getOrders, connector } = fakeConnector(
      [Promise.resolve(page([refund('r1', 'A')], { hasMore: true })), Promise.resolve(page([refund('r2', 'A'), refund('r3', 'E')]))],
      [storeOrder('A', '5'), storeOrder('E', '5')],
    );
    const { result } = render(connector, { ...query, scope: { registerId: '5' } });
    await waitFor(() => expect(result.current.complete).toBe(true));
    expect(getOrders.mock.calls.map(([, asked]) => asked)).toEqual([['A'], ['E']]);
    expect(ids(result.current.refunds)).toEqual(['r1', 'r2', 'r3']);
  });

  it('H6 fetches no order without a set scope field', async () => {
    for (const scope of [undefined, {}, { registerId: undefined }]) {
      const { getOrders, connector } = fakeConnector([Promise.resolve(page([refund('r1', 'A'), refund('r2', 'B')]))], []);
      const { result } = render(connector, { ...query, scope });
      await waitFor(() => expect(result.current.complete).toBe(true));
      expect(ids(result.current.refunds)).toEqual(['r1', 'r2']);
      expect(getOrders).not.toHaveBeenCalled();
    }
  });

  it('H7 makes every scoped refund unscoped when the connector has no getOrders', async () => {
    const { connector } = fakeConnector([Promise.resolve(page([refund('r1'), refund('r2')]))]);
    const { result } = render(connector, { ...query, scope: { storeId: '1' } });
    await waitFor(() => expect(result.current.complete).toBe(true));
    expect(result.current.refunds).toEqual([]);
    expect(ids(result.current.unscoped)).toEqual(['r1', 'r2']);
  });

  it('H8 keeps orphans apart and counts them in downloaded', async () => {
    const { connector } = fakeConnector([
      Promise.resolve(page([refund('r1')], { orphans: [orphan('o1'), orphan('o2')], hasMore: true })),
    ]);
    const { result } = render(connector);
    await waitFor(() => expect(result.current.progress).toEqual({ downloaded: 3, total: null }));
    expect(ids(result.current.orphans)).toEqual(['o1', 'o2']);
    expect(ids(result.current.refunds)).toEqual(['r1']);
    expect(result.current).toMatchObject({ unscoped: [], otherCurrency: [] });
  });

  it('H9 adds a later page\'s unreadable only when it adds a new id, and stops on a stalled page', async () => {
    const { listRefunds, connector } = fakeConnector([
      Promise.resolve(page([refund('r1')], { unreadable: 2, hasMore: true })),
      Promise.resolve(page([refund('r2')], { unreadable: 1, hasMore: true })),
      Promise.resolve(page([refund('r2')], { unreadable: 4, hasMore: true })),
    ]);
    const { result } = render(connector);
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect((result.current.error as Error).message).toBe(STALLED);
    expect(result.current).toMatchObject({ unreadable: 3, progress: null, complete: false });
    expect(ids(result.current.refunds)).toEqual(['r1', 'r2']);
    await act(async () => {});
    expect(listRefunds).toHaveBeenCalledTimes(3);
  });

  it("H9b ignores a last page's unreadable when it adds no new id", async () => {
    const { connector } = fakeConnector([
      Promise.resolve(page([refund('r1')], { unreadable: 2, hasMore: true })),
      Promise.resolve(page([refund('r1')], { unreadable: 5, hasMore: false })),
    ]);
    const { result } = render(connector);
    await waitFor(() => expect(result.current.complete).toBe(true));
    expect(result.current).toMatchObject({ unreadable: 2, complete: true, error: null });
    expect(ids(result.current.refunds)).toEqual(['r1']);
  });

  it('H10 treats an unsupported store as one with no dated refunds', async () => {
    const { connector } = fakeConnector([Promise.reject(new StoreRefundsUnsupportedError('x'))]);
    const { result } = render(connector);
    await waitFor(() => expect(result.current.complete).toBe(true));
    expect(result.current).toEqual(NO_DATED);
  });

  it('H10b drops the pages already read when a later page is unsupported, so dated and embedded never mix', async () => {
    const { connector } = fakeConnector([
      Promise.resolve(page([refund('r1')], { hasMore: true })),
      Promise.reject(new StoreRefundsUnsupportedError('x')),
    ]);
    const { result } = render(connector);
    await waitFor(() => expect(result.current.complete).toBe(true));
    expect(result.current).toEqual(NO_DATED);
  });

  it('H11 stops at a rejection from listRefunds or getOrders and keeps what was counted', async () => {
    const boom = new Error('boom');
    const fromList = fakeConnector([Promise.resolve(page([refund('r1')], { hasMore: true })), Promise.reject(boom)]);
    const fromOrders = fakeConnector(
      [Promise.resolve(page([refund('r1', 'A')], { hasMore: true })), Promise.resolve(page([refund('r2', 'E')]))],
      [async () => [storeOrder('A', '5')], () => Promise.reject(boom)],
    );
    for (const [connector, q] of [[fromList.connector, query], [fromOrders.connector, { ...query, scope: { registerId: '5' } }]] as const) {
      const { result } = render(connector, q);
      await waitFor(() => expect(result.current.error).toBe(boom));
      expect(ids(result.current.refunds)).toEqual(['r1']);
      expect(result.current).toMatchObject({ progress: null, complete: false });
    }
  });

  it('H12 calls nothing without listRefunds, and is idle without a connector, context or query', async () => {
    const { listRefunds, connector } = fakeConnector([]);
    const none = renderHook(() => useStoreRefundsInRange({} as TallyConnector, context, query));
    const idle = [
      renderHook(() => useStoreRefundsInRange(connector, context, null)),
      renderHook(() => useStoreRefundsInRange(connector, null, query)),
      renderHook(() => useStoreRefundsInRange(null, context, query)),
    ];
    await act(async () => {});
    expect(none.result.current).toEqual(NO_DATED);
    for (const { result } of idle) expect(result.current).toEqual(IDLE);
    expect(listRefunds).not.toHaveBeenCalled();
  });

  it('H13 starts again on a new query value, shows no old row, and ignores an equal object', async () => {
    const q1Page1 = deferred<StoreRefundPage>();
    const { listRefunds, connector } = fakeConnector([q1Page1.promise, deferred<StoreRefundPage>().promise]);
    const q2: StoreRefundsRangeQuery = { ...query, currency: 'EUR' };
    const { result, rerender } = renderHook(({ q }) => useStoreRefundsInRange(connector, context, q), {
      initialProps: { q: query },
    });
    await waitFor(() => expect(listRefunds).toHaveBeenCalledTimes(1));
    await act(async () => q1Page1.resolve(page([refund('r1')], { hasMore: true })));
    expect(ids(result.current.refunds)).toEqual(['r1']);

    rerender({ q: q2 });
    expect(result.current).toEqual(STARTING);
    await waitFor(() => expect(listRefunds).toHaveBeenCalledTimes(3));
    expect(listRefunds).toHaveBeenLastCalledWith(context, expect.objectContaining({ page: 1 }));
    rerender({ q: { ...q2 } });
    await act(async () => {});
    expect(listRefunds).toHaveBeenCalledTimes(3);
  });

  it('H13c ignores the orders of an abandoned read that resolve after the new query starts', async () => {
    const old = deferred<StoreOrder[]>();
    const { getOrders, connector } = fakeConnector(
      [Promise.resolve(page([refund('r1', 'A')])), Promise.resolve(page([refund('r2', 'B')]))],
      [() => old.promise, () => Promise.resolve([storeOrder('B', '5')])],
    );
    const q1: StoreRefundsRangeQuery = { ...query, scope: { registerId: '5' } };
    const q2: StoreRefundsRangeQuery = { ...q1, timezone: 'Europe/Berlin' };
    const { result, rerender } = renderHook(({ q }) => useStoreRefundsInRange(connector, context, q), {
      initialProps: { q: q1 },
    });
    await waitFor(() => expect(getOrders).toHaveBeenCalledTimes(1));
    rerender({ q: q2 });
    await waitFor(() => expect(result.current.complete).toBe(true));
    expect(ids(result.current.refunds)).toEqual(['r2']);

    await act(async () => old.resolve([storeOrder('A', '5')]));
    expect(ids(result.current.refunds)).toEqual(['r2']);
    expect(result.current.complete).toBe(true);
  });

  it('H13b makes one page-1 call under StrictMode and none after unmount', async () => {
    const page1 = deferred<StoreRefundPage>();
    const { listRefunds, connector } = fakeConnector([page1.promise]);
    const { unmount } = renderHook(() => useStoreRefundsInRange(connector, context, query), { wrapper: StrictMode });
    await act(async () => {});
    expect(listRefunds).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => page1.resolve(page([refund('r1')], { hasMore: true })));
    expect(listRefunds).toHaveBeenCalledTimes(1);
  });
});

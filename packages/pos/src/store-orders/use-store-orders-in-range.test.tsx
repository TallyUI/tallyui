import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { StoreOrder, StoreOrderPage, SyncContext, TallyConnector } from '@tallyui/core';
import { useStoreOrdersInRange, type StoreOrdersRangeQuery } from './use-store-orders-in-range';

const context: SyncContext = { connectorId: 'fake', baseUrl: 'https://store.test', headers: {} };
const query: StoreOrdersRangeQuery = { dateRange: { after: '2026-11-21T00:00:00.000Z' } };
const IDLE = { orders: [], progress: null, unreadable: 0, error: null, complete: false };
const order = (id: string) => ({ id }) as StoreOrder;
const [A, B, C] = [order('A'), order('B'), order('C')];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

function fakeConnector(...pages: Promise<StoreOrderPage>[]) {
  const listOrders = vi.fn(() => pages.shift() ?? new Promise<StoreOrderPage>(() => {}));
  return { listOrders, connector: { listOrders } as unknown as TallyConnector };
}

const ids = (orders: StoreOrder[]) => orders.map((o) => o.id);

describe('useStoreOrdersInRange', () => {
  it('S1 reads page after page and reports progress', async () => {
    const page1 = deferred<StoreOrderPage>();
    const page2 = deferred<StoreOrderPage>();
    const { listOrders, connector } = fakeConnector(page1.promise, page2.promise);
    const { result } = renderHook(() => useStoreOrdersInRange(connector, context, query));

    expect(result.current.progress).toEqual({ downloaded: 0, total: null });
    await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(1));
    await act(async () => page1.resolve({ orders: [A, B], hasMore: true, total: 3 }));
    expect(result.current.progress).toEqual({ downloaded: 2, total: 3 });
    expect(result.current.complete).toBe(false);

    await act(async () => page2.resolve({ orders: [C], hasMore: false, total: 3 }));
    expect(ids(result.current.orders)).toEqual(['A', 'B', 'C']);
    expect(result.current).toMatchObject({ progress: null, complete: true, error: null });
    expect(listOrders).toHaveBeenCalledTimes(2);
    expect(listOrders).toHaveBeenNthCalledWith(1, context, { ...query, page: 1, perPage: 100 });
    expect(listOrders).toHaveBeenNthCalledWith(2, context, { ...query, page: 2, perPage: 100 });
  });

  it('S2 keeps total null when page 1 gives no count', async () => {
    const page2 = deferred<StoreOrderPage>();
    const { connector } = fakeConnector(Promise.resolve({ orders: [A], hasMore: true }), page2.promise);
    const { result } = renderHook(() => useStoreOrdersInRange(connector, context, query));

    await waitFor(() => expect(result.current.progress).toEqual({ downloaded: 1, total: null }));
    await act(async () => page2.resolve({ orders: [B], hasMore: true, total: 9 }));
    expect(result.current.progress).toEqual({ downloaded: 2, total: null });
  });

  it('S3 drops a repeated order as pages land', async () => {
    const { connector } = fakeConnector(
      Promise.resolve({ orders: [A, B], hasMore: true }),
      Promise.resolve({ orders: [order('B'), C], hasMore: true }),
      deferred<StoreOrderPage>().promise,
    );
    const { result } = renderHook(() => useStoreOrdersInRange(connector, context, query));

    await waitFor(() => expect(ids(result.current.orders)).toEqual(['A', 'B', 'C']));
    expect(result.current.orders[1]).toBe(B);
    const { orders, unreadable, progress } = result.current;
    expect(progress?.downloaded).toBe(3);
    expect(progress?.downloaded).toBe(orders.length + unreadable);
  });

  it('S4 counts unreadable orders in downloaded', async () => {
    const page2 = deferred<StoreOrderPage>();
    const { connector } = fakeConnector(Promise.resolve({ orders: [A], unreadable: 2, hasMore: true, total: 4 }), page2.promise);
    const { result } = renderHook(() => useStoreOrdersInRange(connector, context, query));

    await waitFor(() => expect(result.current.unreadable).toBe(2));
    const { orders, unreadable, progress } = result.current;
    expect(progress).toEqual({ downloaded: 3, total: 4 });
    expect(progress?.downloaded).toBe(orders.length + unreadable);

    await act(async () => page2.resolve({ orders: [B], hasMore: false }));
    expect(result.current).toMatchObject({ unreadable: 2, progress: null, complete: true });
  });

  it('S5 stops at a rejection and keeps the orders read', async () => {
    const boom = new Error('boom');
    const page2 = deferred<StoreOrderPage>();
    const { listOrders, connector } = fakeConnector(Promise.resolve({ orders: [A, B], hasMore: true }), page2.promise);
    const { result } = renderHook(() => useStoreOrdersInRange(connector, context, query));

    await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(2));
    await act(async () => page2.reject(boom));
    expect(result.current.error).toBe(boom);
    expect(ids(result.current.orders)).toEqual(['A', 'B']);
    expect(result.current).toMatchObject({ progress: null, complete: false });
    await act(async () => {});
    expect(listOrders).toHaveBeenCalledTimes(2);
  });

  it('S6 starts again on a new query value and ignores the old read', async () => {
    const q1Page1 = deferred<StoreOrderPage>();
    const { listOrders, connector } = fakeConnector(q1Page1.promise, deferred<StoreOrderPage>().promise);
    const q2: StoreOrdersRangeQuery = { ...query, status: 'completed' };
    const { result, rerender } = renderHook(({ q }) => useStoreOrdersInRange(connector, context, q), {
      initialProps: { q: query },
    });
    await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(1));

    rerender({ q: q2 });
    expect(result.current).toEqual({ ...IDLE, progress: { downloaded: 0, total: null } });
    await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(2));
    expect(listOrders).toHaveBeenLastCalledWith(context, { ...q2, page: 1, perPage: 100 });

    await act(async () => q1Page1.resolve({ orders: [A], hasMore: true, total: 1 }));
    expect(result.current).toEqual({ ...IDLE, progress: { downloaded: 0, total: null } });

    rerender({ q: { ...q2 } });
    await act(async () => {});
    expect(listOrders).toHaveBeenCalledTimes(2);
  });

  it("S6b shows none of the old query's orders once it has published", async () => {
    const q1Page1 = deferred<StoreOrderPage>();
    const { listOrders, connector } = fakeConnector(q1Page1.promise, deferred<StoreOrderPage>().promise);
    const q2: StoreOrdersRangeQuery = { ...query, status: 'completed' };
    const { result, rerender } = renderHook(({ q }) => useStoreOrdersInRange(connector, context, q), {
      initialProps: { q: query },
    });
    await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(1));

    await act(async () => q1Page1.resolve({ orders: [A], hasMore: true, total: 5 }));
    expect(ids(result.current.orders)).toEqual(['A']);

    rerender({ q: q2 });
    expect(result.current).toEqual({ ...IDLE, progress: { downloaded: 0, total: null } });
  });

  it('S6c shows no old read on a switch back', async () => {
    const q1Page1 = deferred<StoreOrderPage>();
    const { listOrders, connector } = fakeConnector(q1Page1.promise, deferred<StoreOrderPage>().promise);
    const q2: StoreOrdersRangeQuery = { ...query, status: 'completed' };
    const { result, rerender } = renderHook(({ q }) => useStoreOrdersInRange(connector, context, q), {
      initialProps: { q: query },
    });
    await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(1));
    await act(async () => q1Page1.resolve({ orders: [A], hasMore: true, total: 5 }));
    await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(2));
    expect(ids(result.current.orders)).toEqual(['A']);

    rerender({ q: q2 });
    rerender({ q: query });
    expect(result.current).toEqual({ ...IDLE, progress: { downloaded: 0, total: null } });
    await act(async () => {});
    expect(result.current).toEqual({ ...IDLE, progress: { downloaded: 0, total: null } });
  });

  it('S6d keeps the new read when the old one lands late', async () => {
    const q2: StoreOrdersRangeQuery = { ...query, status: 'completed' };
    for (const settle of ['resolve', 'reject'] as const) {
      const d1 = deferred<StoreOrderPage>();
      const { listOrders, connector } = fakeConnector(d1.promise, Promise.resolve({ orders: [B], hasMore: false }));
      const { result, rerender } = renderHook(({ q }) => useStoreOrdersInRange(connector, context, q), {
        initialProps: { q: query },
      });
      await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(1));

      rerender({ q: q2 });
      await waitFor(() => expect(result.current.complete).toBe(true));
      expect(ids(result.current.orders)).toEqual(['B']);

      await act(async () => {
        if (settle === 'resolve') d1.resolve({ orders: [A], hasMore: true });
        else d1.reject(new Error('late'));
      });
      expect(ids(result.current.orders)).toEqual(['B']);
      expect(result.current).toMatchObject({ complete: true, error: null });
    }
  });

  it('S6e starts again on a new context', async () => {
    const { listOrders, connector } = fakeConnector(Promise.resolve({ orders: [A], hasMore: false }));
    const { result, rerender } = renderHook(({ ctx }) => useStoreOrdersInRange(connector, ctx, query), {
      initialProps: { ctx: context },
    });
    await waitFor(() => expect(result.current.complete).toBe(true));
    expect(listOrders).toHaveBeenCalledTimes(1);

    const context2: SyncContext = { ...context };
    rerender({ ctx: context2 });
    expect(result.current).toEqual({ ...IDLE, progress: { downloaded: 0, total: null } });
    await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(2));
    const [calledContext] = listOrders.mock.lastCall as unknown as [SyncContext];
    expect(calledContext).toBe(context2);
  });

  it('S7 is idle and calls nothing without a query, a context or listOrders', async () => {
    const { listOrders, connector } = fakeConnector();
    const cases = [
      renderHook(() => useStoreOrdersInRange(connector, context, null)),
      renderHook(() => useStoreOrdersInRange(connector, null, query)),
      renderHook(() => useStoreOrdersInRange({} as TallyConnector, context, query)),
    ];
    await act(async () => {});
    for (const { result } of cases) expect(result.current).toEqual(IDLE);
    expect(listOrders).not.toHaveBeenCalled();
  });

  it('S8 requests nothing more after unmount', async () => {
    const page1 = deferred<StoreOrderPage>();
    const { listOrders, connector } = fakeConnector(page1.promise);
    const { unmount } = renderHook(() => useStoreOrdersInRange(connector, context, query));
    await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(1));

    unmount();
    await act(async () => page1.resolve({ orders: [A], hasMore: true }));
    expect(listOrders).toHaveBeenCalledTimes(1);
  });

  it('S9 makes one page-1 call under StrictMode', async () => {
    const { listOrders, connector } = fakeConnector();
    renderHook(() => useStoreOrdersInRange(connector, context, query), { wrapper: StrictMode });

    await act(async () => {});
    expect(listOrders).toHaveBeenCalledTimes(1);
  });
});

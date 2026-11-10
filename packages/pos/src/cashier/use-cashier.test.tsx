import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Cashier, SyncContext, TallyConnector } from '@tallyui/core';
import { useCashier } from './use-cashier';

const context: SyncContext = { connectorId: 'fake', baseUrl: 'https://store.test', headers: {} };

function fakeConnector(cashier?: TallyConnector['cashier']): TallyConnector {
  return { cashier } as unknown as TallyConnector;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('useCashier', () => {
  it('allows everything when the connector has no cashier()', () => {
    const { result } = renderHook(() => useCashier(fakeConnector(), context));

    expect(result.current).toMatchObject({ loading: false, cashier: null, blind: false, reports: 'allowed' });
    expect(result.current.can('refund')).toBe(true);
  });

  it('is loading, then the cashier with unknown names dropped', async () => {
    const pending = deferred<Cashier | null>();
    const cashier = vi.fn(() => pending.promise);
    const connector = fakeConnector(cashier);
    const { result } = renderHook(() => useCashier(connector, context));

    expect(result.current).toMatchObject({ loading: true, blind: true, reports: 'pending' });
    expect(result.current.can('viewReports')).toBe(false);

    await act(async () => pending.resolve({ id: '7', name: 'Ana', permissions: ['viewReports', 'bogus'] } as unknown as Cashier));
    expect(result.current.cashier).toEqual({ id: '7', name: 'Ana', permissions: ['viewReports'] });
    expect(result.current).toMatchObject({ loading: false, blind: false, reports: 'allowed' });
    expect(result.current.can('refund')).toBe(false);
    expect(cashier).toHaveBeenCalledExactlyOnceWith(context);
  });

  it('counts blind and denies Reports without viewReports', async () => {
    const connector = fakeConnector(async () => ({ id: '8', name: 'Bo', permissions: ['refund'] }));
    const { result } = renderHook(() => useCashier(connector, context));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ blind: true, reports: 'denied' });
    expect(result.current.can('refund')).toBe(true);
  });

  it('allows everything when cashier() resolves null', async () => {
    const connector = fakeConnector(async () => null);
    const { result } = renderHook(() => useCashier(connector, context));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ cashier: null, blind: false, reports: 'allowed' });
  });

  it('fails closed when cashier() rejects', async () => {
    const failure = new Error('offline');
    const connector = fakeConnector(async () => {
      throw failure;
    });
    const { result } = renderHook(() => useCashier(connector, context));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ error: failure, cashier: null, blind: true, reports: 'denied' });
    expect(result.current.can('viewReports')).toBe(false);
  });

  it('waits without a connector or context', () => {
    const cashier = vi.fn();
    const { result } = renderHook(() => useCashier(null, null));
    renderHook(() => useCashier(fakeConnector(cashier), null));

    expect(result.current).toMatchObject({ loading: true, blind: true, reports: 'pending' });
    expect(cashier).not.toHaveBeenCalled();
  });

  it('reads again on a context change and ignores the stale answer', async () => {
    const all = { id: '1', name: 'Ana', permissions: ['viewReports', 'manageClosures', 'approveVariance', 'refund', 'discount'] } as const;
    const first = deferred<Cashier | null>();
    const second = deferred<Cashier | null>();
    const third = deferred<Cashier | null>();
    const cashier = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise);
    const connector = fakeConnector(cashier);
    const other: SyncContext = { ...context, baseUrl: 'https://other.test' };
    const last: SyncContext = { ...context, baseUrl: 'https://last.test' };
    const { result, rerender } = renderHook(({ ctx }) => useCashier(connector, ctx), { initialProps: { ctx: context } });

    await act(async () => first.resolve(all));
    expect(result.current.reports).toBe('allowed');
    // The finished read was for the old context: the new one is loading.
    rerender({ ctx: other });
    expect(result.current).toMatchObject({ loading: true, blind: true, reports: 'pending' });

    // A read still in flight when the context changes is discarded.
    rerender({ ctx: last });
    await act(async () => second.resolve(all));
    expect(result.current.loading).toBe(true);

    await act(async () => third.resolve({ id: '2', name: 'Bo', permissions: [] }));
    expect(result.current).toMatchObject({ loading: false, blind: true, reports: 'denied' });
    expect(cashier).toHaveBeenCalledTimes(3);
    expect(cashier).toHaveBeenLastCalledWith(last);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { StoreSettingsError } from '@tallyui/core';
import type { StoreSettings, StoreSettingsChoice, SyncContext, TallyConnector, TaxRounding } from '@tallyui/core';
import { StoreCapabilitiesUnavailableError, useStoreSettings } from './use-store-settings';
import type { StoreSettingsState } from './use-store-settings';

const context: SyncContext = { connectorId: 'fake', baseUrl: 'https://store.test', headers: {} };
const settings: StoreSettings = { currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 0 } };
const updated: StoreSettings = { ...settings, pricesIncludeTax: true };

function fakeConnector(storeSettings?: TallyConnector['storeSettings']): TallyConnector {
  return { storeSettings } as unknown as TallyConnector;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** Records every state the hook returns; `readies()` is each distinct ready `settings` identity, in order. */
const track = (connector: TallyConnector, ctx: SyncContext = context) => {
  const seen: StoreSettingsState[] = [];
  const hook = renderHook(({ ctx }) => {
    const state = useStoreSettings({ connector, context: ctx, loadChoice: () => undefined, saveChoice: vi.fn() });
    seen.push(state);
    return state;
  }, { initialProps: { ctx } });
  const readies = () => [...new Set(seen.flatMap((s) => (s.state === 'ready' ? [s.settings] : [])))];
  return { ...hook, seen, readies };
};

afterEach(() => vi.useRealTimers());

describe('useStoreSettings refresh', () => {
  it('stays ready with the old settings while pending and emits the new settings once', async () => {
    const pending = deferred<StoreSettings>();
    const storeSettings = vi.fn().mockResolvedValueOnce(settings).mockReturnValueOnce(pending.promise);
    const { result, seen, readies } = track(fakeConnector(storeSettings));
    await waitFor(() => expect(result.current.state).toBe('ready'));
    const old = result.current;
    if (old.state !== 'ready') return;

    await act(async () => old.refresh());
    expect(storeSettings).toHaveBeenCalledTimes(2);
    expect(result.current).toEqual({ ...old, refreshing: true });
    if (result.current.state === 'ready') expect(result.current.settings).toBe(old.settings);
    await act(async () => pending.resolve(updated));
    await act(async () => {});
    expect(result.current).toEqual({ state: 'ready', settings: updated, choice: undefined, refresh: expect.any(Function) });
    expect(result.current).not.toHaveProperty('refreshing');
    expect(result.current).not.toHaveProperty('refreshError');
    expect(readies()).toEqual([settings, updated]);
    expect(seen.slice(seen.indexOf(old)).map((s) => s.state)).not.toContain('loading');
    await act(async () => old.refresh());
    expect(storeSettings).toHaveBeenCalledTimes(2);
  });

  it('reads capabilities again and carries the second tax rounding', async () => {
    const taxRounding: TaxRounding = { granularity: 'per_rate_group_items', mode: 'half_up' };
    const capabilities = vi.fn().mockResolvedValueOnce({ orderCreate: 3 }).mockResolvedValueOnce({ orderCreate: 3, taxRounding });
    const connector = { ...fakeConnector(vi.fn().mockResolvedValue(settings)), capabilities };
    const { result } = track(connector);
    await waitFor(() => expect(result.current.state).toBe('ready'));
    const ready = result.current;
    if (ready.state !== 'ready') return;

    await act(async () => ready.refresh());
    expect(capabilities).toHaveBeenCalledTimes(2);
    expect(capabilities).toHaveBeenLastCalledWith(context);
    expect(result.current).toEqual({ state: 'ready', settings: { ...settings, taxRounding }, choice: undefined, refresh: expect.any(Function) });
  });

  it('keeps old settings on failure without a timer, then clears the error on the next refresh', async () => {
    const error = new Error('offline');
    const pending = deferred<StoreSettings>();
    const storeSettings = vi.fn().mockResolvedValueOnce(settings).mockRejectedValueOnce(error).mockReturnValueOnce(pending.promise);
    const { result, readies } = track(fakeConnector(storeSettings));
    await waitFor(() => expect(result.current.state).toBe('ready'));
    const old = result.current;
    if (old.state !== 'ready') return;
    vi.useFakeTimers();

    await act(async () => old.refresh());
    const failed = result.current;
    expect(failed).toEqual({ ...old, refresh: expect.any(Function), refreshError: error });
    if (failed.state !== 'ready') return;
    expect(failed.settings).toBe(old.settings);
    expect(failed.refreshError).toBe(error);
    expect(failed).not.toHaveProperty('refreshing');
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000); });
    expect(storeSettings).toHaveBeenCalledTimes(2);

    await act(async () => failed.refresh());
    expect(result.current).toEqual({ ...old, refresh: failed.refresh, refreshing: true });
    expect(result.current).not.toHaveProperty('refreshError');
    await act(async () => pending.resolve(updated));
    expect(result.current).toEqual({ state: 'ready', settings: updated, choice: undefined, refresh: expect.any(Function) });
    expect(readies()).toEqual([settings, updated]);
  });

  it('keeps old settings without automatic retry when rounding is unknown during a refresh', async () => {
    const capabilities = vi.fn().mockResolvedValueOnce({ orderCreate: 3 }).mockRejectedValue(new Error('offline'));
    const storeSettings = vi.fn().mockResolvedValue(settings);
    const { result } = track({ ...fakeConnector(storeSettings), capabilities });
    await waitFor(() => expect(result.current.state).toBe('ready'));
    const old = result.current;
    if (old.state !== 'ready') return;
    vi.useFakeTimers();

    await act(async () => old.refresh());
    expect(result.current.state).toBe('ready');
    if (result.current.state !== 'ready') return;
    expect(result.current.settings).toBe(old.settings);
    expect(result.current.refreshError).toBeInstanceOf(StoreCapabilitiesUnavailableError);
    expect(result.current).not.toHaveProperty('refreshing');
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000); });
    expect(storeSettings).toHaveBeenCalledTimes(2);
    expect(capabilities).toHaveBeenCalledTimes(2);
  });

  it('ignores a second refresh while one is running', async () => {
    const pending = deferred<StoreSettings>();
    const storeSettings = vi.fn().mockResolvedValueOnce(settings).mockReturnValue(pending.promise);
    const { result } = track(fakeConnector(storeSettings));
    await waitFor(() => expect(result.current.state).toBe('ready'));
    const ready = result.current;
    if (ready.state !== 'ready') return;

    await act(async () => { ready.refresh(); ready.refresh(); });
    expect(storeSettings).toHaveBeenCalledTimes(2);
    expect(result.current).toEqual({ ...ready, refreshing: true });
  });

  it('discards a refresh racing a store switch and ignores the old refresh callback', async () => {
    const pending = deferred<StoreSettings>();
    const switched = deferred<StoreSettings>();
    const storeSettings = vi.fn().mockResolvedValueOnce(settings).mockReturnValueOnce(pending.promise).mockReturnValueOnce(switched.promise);
    const { result, rerender } = track(fakeConnector(storeSettings));
    await waitFor(() => expect(result.current.state).toBe('ready'));
    const old = result.current;
    if (old.state !== 'ready') return;

    await act(async () => old.refresh());
    expect(storeSettings).toHaveBeenCalledTimes(2);
    const otherContext = { ...context, baseUrl: 'https://other.test' };
    rerender({ ctx: otherContext });
    expect(result.current).toEqual({ state: 'loading' });
    await act(async () => pending.resolve(updated));
    expect(result.current).toEqual({ state: 'loading' });
    expect(storeSettings).toHaveBeenLastCalledWith(otherContext, undefined);
    const otherSettings = { ...settings, currency: 'USD' };
    await act(async () => switched.resolve(otherSettings));
    expect(result.current).toEqual({ state: 'ready', settings: otherSettings, choice: undefined, refresh: expect.any(Function) });
    await act(async () => old.refresh());
    expect(storeSettings).toHaveBeenCalledTimes(3);
  });

  it('does not update after unmount during a refresh', async () => {
    const pending = deferred<StoreSettings>();
    const storeSettings = vi.fn().mockResolvedValueOnce(settings).mockReturnValueOnce(pending.promise);
    const { result, unmount, seen } = track(fakeConnector(storeSettings));
    await waitFor(() => expect(result.current.state).toBe('ready'));
    const ready = result.current;
    if (ready.state !== 'ready') return;

    await act(async () => ready.refresh());
    const refreshing = result.current;
    expect(refreshing).toEqual({ ...ready, refreshing: true });
    const renders = seen.length;
    unmount();
    await act(async () => pending.resolve(updated));
    expect(result.current).toBe(refreshing);
    expect(seen).toHaveLength(renders);
  });

  it('keeps the choice that resolved the settings', async () => {
    const storeSettings = vi.fn(async (_context: SyncContext, choice?: StoreSettingsChoice) => {
      if (!choice) throw new StoreSettingsError('choice_required', 'pick a country', { countries: ['de', 'fr'] });
      return settings;
    });
    const { result } = track(fakeConnector(storeSettings));
    await waitFor(() => expect(result.current.state).toBe('choose'));
    const choose = result.current;
    if (choose.state !== 'choose') return;
    const choice = { country: 'de' };
    await act(async () => choose.choose(choice));
    const ready = result.current;
    expect(ready.state).toBe('ready');
    if (ready.state !== 'ready') return;
    expect(ready.choice).toBe(choice);

    await act(async () => ready.refresh());
    expect(storeSettings).toHaveBeenCalledTimes(3);
    expect(storeSettings).toHaveBeenLastCalledWith(context, choice);
  });
});

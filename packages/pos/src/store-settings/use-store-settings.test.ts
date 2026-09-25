import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { StoreSettingsError } from '@tallyui/core';
import type { StoreSettings, StoreSettingsChoice, SyncContext, TallyConnector } from '@tallyui/core';
import { useStoreSettings } from './use-store-settings';

const context: SyncContext = { connectorId: 'fake', baseUrl: 'https://store.test', headers: {} };
const settings: StoreSettings = { currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 0 } };
const choices = { countries: ['de', 'fr'] };

function fakeConnector(storeSettings?: TallyConnector['storeSettings']): TallyConnector {
  return { storeSettings } as unknown as TallyConnector;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('useStoreSettings', () => {
  it('is loading, then ready', async () => {
    const pending = deferred<StoreSettings>();
    const connector = fakeConnector(() => pending.promise);
    const { result } = renderHook(() => useStoreSettings({ connector, context, loadChoice: () => undefined, saveChoice: vi.fn() }));

    expect(result.current).toEqual({ state: 'loading' });
    await act(async () => pending.resolve(settings));
    expect(result.current).toEqual({ state: 'ready', settings, choice: undefined });
  });

  it('is choose, then choose(choice) resolves to ready and saves the pick', async () => {
    const storeSettings = vi.fn(async (_context: SyncContext, choice?: StoreSettingsChoice) => {
      if (!choice) throw new StoreSettingsError('choice_required', 'pick a country', choices);
      return settings;
    });
    const saveChoice = vi.fn();
    const connector = fakeConnector(storeSettings);
    const { result } = renderHook(() => useStoreSettings({ connector, context, loadChoice: () => undefined, saveChoice }));

    await waitFor(() => expect(result.current.state).toBe('choose'));
    const current = result.current;
    if (current.state !== 'choose') return;
    expect(current.choices).toEqual(choices);

    act(() => current.choose({ country: 'de' }));
    await waitFor(() => expect(result.current).toEqual({ state: 'ready', settings, choice: { country: 'de' } }));
    expect(saveChoice).toHaveBeenCalledExactlyOnceWith({ country: 'de' });
  });

  it('is error, then retry() resolves to ready', async () => {
    const failure = new StoreSettingsError('failed', 'offline');
    const storeSettings = vi.fn<NonNullable<TallyConnector['storeSettings']>>().mockRejectedValueOnce(failure).mockResolvedValue(settings);
    const connector = fakeConnector(storeSettings);
    const { result } = renderHook(() => useStoreSettings({ connector, context, loadChoice: () => undefined, saveChoice: vi.fn() }));

    await waitFor(() => expect(result.current.state).toBe('error'));
    const current = result.current;
    if (current.state !== 'error') return;
    expect(current.error).toBe(failure);

    act(() => current.retry());
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(storeSettings).toHaveBeenCalledTimes(2);
  });

  it('discards a stale result when the context changes mid-flight', async () => {
    const first = deferred<StoreSettings>();
    const second = deferred<StoreSettings>();
    const storeSettings = vi.fn<NonNullable<TallyConnector['storeSettings']>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const connector = fakeConnector(storeSettings);
    const otherContext: SyncContext = { ...context, baseUrl: 'https://other.test' };
    const { result, rerender } = renderHook(
      ({ ctx }) => useStoreSettings({ connector, context: ctx, loadChoice: () => undefined, saveChoice: vi.fn() }),
      { initialProps: { ctx: context } },
    );
    await waitFor(() => expect(storeSettings).toHaveBeenCalledTimes(1));

    rerender({ ctx: otherContext });
    await waitFor(() => expect(storeSettings).toHaveBeenCalledTimes(2));
    expect(storeSettings).toHaveBeenLastCalledWith(otherContext, undefined);

    await act(async () => first.resolve({ ...settings, currency: 'USD' }));
    expect(result.current).toEqual({ state: 'loading' });

    await act(async () => second.resolve(settings));
    expect(result.current).toEqual({ state: 'ready', settings, choice: undefined });
  });

  it('is unsupported when the connector has no storeSettings', async () => {
    const loadChoice = vi.fn(() => undefined);
    const connector = fakeConnector();
    const { result } = renderHook(() => useStoreSettings({ connector, context, loadChoice, saveChoice: vi.fn() }));

    await waitFor(() => expect(result.current).toEqual({ state: 'unsupported' }));
    expect(loadChoice).not.toHaveBeenCalled();
  });

  it('after unmount, a pending resolution never updates state', async () => {
    const pending = deferred<StoreSettings>();
    const connector = fakeConnector(() => pending.promise);
    const { result, unmount } = renderHook(() => useStoreSettings({ connector, context, loadChoice: () => undefined, saveChoice: vi.fn() }));
    expect(result.current).toEqual({ state: 'loading' });

    unmount();
    await act(async () => pending.resolve(settings));
    expect(result.current).toEqual({ state: 'loading' }); // no update reached it; a mid-flight resolve after unmount would warn
  });

  it('retry() after a failed initial resolve reuses the stored choice', async () => {
    const failure = new StoreSettingsError('failed', 'offline');
    const storeSettings = vi.fn<NonNullable<TallyConnector['storeSettings']>>().mockRejectedValueOnce(failure).mockResolvedValue(settings);
    const connector = fakeConnector(storeSettings);
    const { result } = renderHook(() => useStoreSettings({ connector, context, loadChoice: () => ({ country: 'de' }), saveChoice: vi.fn() }));

    await waitFor(() => expect(result.current.state).toBe('error'));
    const current = result.current;
    if (current.state !== 'error') return;

    act(() => current.retry());
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(storeSettings).toHaveBeenNthCalledWith(1, context, { country: 'de' });
    expect(storeSettings).toHaveBeenNthCalledWith(2, context, { country: 'de' }); // reloaded, not just remembered
  });

  it('retry() after choose(pick) fails reuses that pick, not the stored choice', async () => {
    const failure = new StoreSettingsError('failed', 'offline');
    const storeSettings = vi.fn<NonNullable<TallyConnector['storeSettings']>>()
      .mockRejectedValueOnce(new StoreSettingsError('choice_required', 'pick a country', choices))
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(settings);
    const connector = fakeConnector(storeSettings);
    const { result } = renderHook(() => useStoreSettings({ connector, context, loadChoice: () => ({ country: 'fr' }), saveChoice: vi.fn() }));

    await waitFor(() => expect(result.current.state).toBe('choose'));
    const choosing = result.current;
    if (choosing.state !== 'choose') return;
    act(() => choosing.choose({ country: 'de' }));

    await waitFor(() => expect(result.current.state).toBe('error'));
    const failed = result.current;
    if (failed.state !== 'error') return;
    act(() => failed.retry());

    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(storeSettings).toHaveBeenNthCalledWith(3, context, { country: 'de' });
  });

  it('ignores a choose captured before a store switch, leaving the new store untouched', async () => {
    const storeSettingsA = vi.fn(async () => {
      throw new StoreSettingsError('choice_required', 'pick a country', choices);
    });
    const connectorA = fakeConnector(storeSettingsA);
    const pendingB = deferred<StoreSettings>();
    const storeSettingsB = vi.fn(() => pendingB.promise);
    const connectorB = fakeConnector(storeSettingsB);
    const saveChoiceB = vi.fn();

    const { result, rerender } = renderHook(
      ({ connector, saveChoice }: { connector: TallyConnector; saveChoice: typeof saveChoiceB }) =>
        useStoreSettings({ connector, context, loadChoice: () => undefined, saveChoice }),
      { initialProps: { connector: connectorA, saveChoice: vi.fn() } },
    );

    await waitFor(() => expect(result.current.state).toBe('choose'));
    const stale = result.current;
    if (stale.state !== 'choose') return;

    rerender({ connector: connectorB, saveChoice: saveChoiceB });
    await waitFor(() => expect(storeSettingsB).toHaveBeenCalledTimes(1));
    const beforeStale = result.current;

    act(() => stale.choose({ country: 'de' }));

    expect(saveChoiceB).not.toHaveBeenCalled();
    expect(storeSettingsB).toHaveBeenCalledTimes(1); // the stale choose triggered no extra resolve
    expect(result.current).toEqual(beforeStale);
  });
});

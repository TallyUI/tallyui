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
});

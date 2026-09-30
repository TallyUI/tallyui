import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { StoreSettingsError } from '@tallyui/core';
import type { ServerCapabilities, StoreSettings, StoreSettingsChoice, SyncContext, TallyConnector, TaxRounding } from '@tallyui/core';
import { useStoreSettings } from './use-store-settings';
import type { StoreSettingsState } from './use-store-settings';

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

  describe('taxRounding (#324)', () => {
    const vendure: TaxRounding = { granularity: 'per_rate_group_items', mode: 'half_up' };
    const withCapabilities = (capabilities: TallyConnector['capabilities']) =>
      ({ storeSettings: async () => settings, capabilities }) as unknown as TallyConnector;
    /** Records every state the hook returns; `readies()` is each distinct ready `settings` identity, in order. */
    const track = (connector: TallyConnector, ctx: SyncContext = context) => {
      const seen: StoreSettingsState[] = [];
      const hook = renderHook(() => {
        const state = useStoreSettings({ connector, context: ctx, loadChoice: () => undefined, saveChoice: vi.fn() });
        seen.push(state);
        return state;
      });
      const readies = () => [...new Set(seen.flatMap((s) => (s.state === 'ready' ? [s.settings] : [])))];
      return { result: hook.result, readies };
    };
    /** The one ready settings of a resolve: a second identity, e.g. a late patch, fails. */
    const resolved = async (connector: TallyConnector, ctx: SyncContext = context) => {
      const { result, readies } = track(connector, ctx);
      await waitFor(() => expect(result.current.state).toBe('ready'));
      await act(async () => {}); // a later change would land here
      expect(readies()).toHaveLength(1);
      return readies()[0];
    };

    it("takes the context's capabilities, without reading the connector's, and emits once", async () => {
      const capabilities = vi.fn();
      const ctx = { ...context, capabilities: { orderCreate: 3, taxRounding: vendure } };
      expect(await resolved(withCapabilities(capabilities), ctx)).toEqual({ ...settings, taxRounding: vendure });
      expect(capabilities).not.toHaveBeenCalled();
    });

    it("reads the connector's capabilities once when the context has none", async () => {
      const capabilities = vi.fn(async () => ({ orderCreate: 3, taxRounding: vendure }));
      expect(await resolved(withCapabilities(capabilities))).toEqual({ ...settings, taxRounding: vendure });
      expect(capabilities).toHaveBeenCalledExactlyOnceWith(context);
    });

    it('waits for a read landing after the settings, then emits the settings once, with the rounding', async () => {
      const read = deferred<ServerCapabilities | undefined>();
      const storeSettings = vi.fn(async () => settings);
      const { result, readies } = track({ storeSettings, capabilities: () => read.promise } as unknown as TallyConnector);
      await act(async () => {});
      expect(storeSettings).toHaveBeenCalledOnce();
      expect(result.current).toEqual({ state: 'loading' });

      await act(async () => read.resolve({ orderCreate: 3, taxRounding: vendure }));
      await act(async () => {});
      expect(result.current.state).toBe('ready');
      expect(readies()).toEqual([{ ...settings, taxRounding: vendure }]);
    });

    it('a throwing read gives the settings without taxRounding, emitted once', async () => {
      for (const capabilities of [async () => { throw new Error('offline'); }, () => { throw new Error('sync'); }]) {
        const got = await resolved(withCapabilities(capabilities as TallyConnector['capabilities']));
        expect(got).toEqual(settings);
        expect(got).not.toHaveProperty('taxRounding');
      }
    });

    it('a connector without capabilities gives the settings without taxRounding, emitted once', async () => {
      const got = await resolved(fakeConnector(async () => settings));
      expect(got).toEqual(settings);
      expect(got).not.toHaveProperty('taxRounding');
    });

    it('leaves the field out when the capabilities read carries none', async () => {
      for (const capabilities of [async () => undefined, async () => ({ orderCreate: 3 })]) {
        const got = await resolved(withCapabilities(capabilities as TallyConnector['capabilities']));
        expect(got).not.toHaveProperty('taxRounding');
      }
    });

    it("reads once through a choose, reusing the request's read for the pick", async () => {
      const capabilities = vi.fn(async () => ({ orderCreate: 3, taxRounding: vendure }));
      const storeSettings = async (_context: SyncContext, choice?: StoreSettingsChoice) => {
        if (!choice) throw new StoreSettingsError('choice_required', 'pick a country', choices);
        return settings;
      };
      const { result, readies } = track({ storeSettings, capabilities } as unknown as TallyConnector);
      await waitFor(() => expect(result.current.state).toBe('choose'));
      const current = result.current;
      if (current.state !== 'choose') return;

      act(() => current.choose({ country: 'de' }));
      await waitFor(() => expect(result.current.state).toBe('ready'));
      await act(async () => {});
      expect(readies()).toEqual([{ ...settings, taxRounding: vendure }]);
      expect(capabilities).toHaveBeenCalledOnce();
    });
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

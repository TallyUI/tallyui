import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ConnectorUnauthorizedError, SignInError, StoreSettingsError } from '@tallyui/core';
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

    it('a connector without capabilities gives the settings without taxRounding, emitted once', async () => {
      const got = await resolved(fakeConnector(async () => settings));
      expect(got).toEqual(settings);
      expect(got).not.toHaveProperty('taxRounding');
    });

    it('leaves the field out when the capabilities read carries none', async () => {
      const got = await resolved(withCapabilities(async () => ({ orderCreate: 3 })));
      expect(got).not.toHaveProperty('taxRounding');
    });

    describe('unavailable capabilities', () => {
      beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(100_000);
      });
      afterEach(() => vi.useRealTimers());

      it.each([
        new ConnectorUnauthorizedError('x', 401),
        new SignInError('invalid_credentials', 'x'),
      ])('does not retry a till error (%s)', async (failure) => {
        const capabilities = vi.fn().mockRejectedValue(failure);
        const { result } = track(withCapabilities(capabilities));
        await act(async () => {});
        expect(result.current.state).toBe('error');
        if (result.current.state !== 'error') return;
        expect(result.current.error).toBe(failure);
        expect(result.current).not.toHaveProperty('nextRetryAt');
        await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
        expect(capabilities).toHaveBeenCalledOnce();
      });

      it.each([
        new ConnectorUnauthorizedError('x', 403),
        new SignInError('server_error', 'x'),
        new Error('offline'),
      ])('retries a non-till error (%s)', async (failure) => {
        const capabilities = vi.fn().mockRejectedValue(failure);
        const { result } = track(withCapabilities(capabilities));
        await act(async () => {});
        expect(result.current.state).toBe('error');
        if (result.current.state !== 'error') return;
        expect(result.current.error).toMatchObject({ name: 'StoreCapabilitiesUnavailableError', cause: failure });
        expect(result.current.nextRetryAt).toBe(105_000);
      });

      it('a throwing read waits and re-reads after 5 seconds, then emits the rounding', async () => {
        const failure = new Error('offline');
        const capabilities = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue({ orderCreate: 3, taxRounding: vendure });
        const { result, readies } = track(withCapabilities(capabilities));
        await act(async () => {});
        expect(result.current.state).toBe('error');
        if (result.current.state !== 'error') return;
        expect(result.current.error).toMatchObject({ name: 'StoreCapabilitiesUnavailableError', cause: failure });
        expect(result.current.nextRetryAt).toBe(105_000);
        expect(readies()).toEqual([]);

        await act(async () => { await vi.advanceTimersByTimeAsync(4_999); });
        expect(capabilities).toHaveBeenCalledTimes(1);
        await act(async () => { await vi.advanceTimersByTimeAsync(1); });
        expect(capabilities).toHaveBeenCalledTimes(2);
        expect(result.current.state).toBe('ready');
        expect(readies()).toEqual([{ ...settings, taxRounding: vendure }]);
      });

      it('an undefined read stays unresolved and retries', async () => {
        const capabilities = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValue({ orderCreate: 3, taxRounding: vendure });
        const { result, readies } = track(withCapabilities(capabilities));
        await act(async () => {});
        expect(result.current.state).toBe('error');
        if (result.current.state !== 'error') return;
        expect(result.current.error).toMatchObject({ name: 'StoreCapabilitiesUnavailableError', cause: undefined });
        expect(result.current.nextRetryAt).toBe(105_000);
        expect(readies()).toEqual([]);

        await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
        expect(capabilities).toHaveBeenCalledTimes(2);
        expect(readies()).toEqual([{ ...settings, taxRounding: vendure }]);
      });

      it('doubles the retry delay and caps it at five minutes', async () => {
        const capabilities = vi.fn(async () => undefined);
        const { result } = track(withCapabilities(capabilities));
        await act(async () => {});
        for (const delay of [5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000]) {
          expect(result.current.state).toBe('error');
          if (result.current.state !== 'error') return;
          expect(result.current.nextRetryAt).toBe(Date.now() + delay);
          await act(async () => { await vi.advanceTimersByTimeAsync(delay); });
        }
        expect(capabilities).toHaveBeenCalledTimes(9);
        expect(result.current.state).toBe('error');
        if (result.current.state === 'error') expect(result.current.nextRetryAt).toBe(Date.now() + 300_000);
      });

      it('clears the retry timer on unmount', async () => {
        const capabilities = vi.fn(async () => undefined);
        const connector = withCapabilities(capabilities);
        const { result, unmount } = renderHook(() => useStoreSettings({ connector, context, loadChoice: () => undefined, saveChoice: vi.fn() }));
        await act(async () => {});
        expect(result.current.state).toBe('error');
        unmount();
        await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
        expect(capabilities).toHaveBeenCalledOnce();
      });

      it('manual retry cancels the scheduled retry', async () => {
        const capabilities = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ orderCreate: 3, taxRounding: vendure });
        const connector = withCapabilities(capabilities);
        const { result } = renderHook(() => useStoreSettings({ connector, context, loadChoice: () => undefined, saveChoice: vi.fn() }));
        await act(async () => {});
        expect(result.current.state).toBe('error');
        if (result.current.state !== 'error') return;
        act(() => result.current.state === 'error' && result.current.retry());
        await act(async () => {});
        expect(result.current.state).toBe('ready');
        await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
        expect(capabilities).toHaveBeenCalledTimes(2);
      });

      it('a successful manual retry prevents the old timer from reading again', async () => {
        const capabilities = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ orderCreate: 3, taxRounding: vendure });
        const { result } = track(withCapabilities(capabilities));
        await act(async () => {});
        expect(result.current.state).toBe('error');
        if (result.current.state !== 'error') return;
        await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
        act(() => result.current.state === 'error' && result.current.retry());
        await act(async () => {});
        expect(result.current.state).toBe('ready');
        expect(vi.getTimerCount()).toBe(0);
        await act(async () => { await vi.advanceTimersByTimeAsync(3_001); });
        expect(capabilities).toHaveBeenCalledTimes(2);
      });

      it('resets the backoff after an automatic retry reaches choose and the pick fails', async () => {
        const capabilities = vi.fn()
          .mockRejectedValueOnce(new Error('offline'))
          .mockResolvedValueOnce({ orderCreate: 3, taxRounding: vendure })
          .mockRejectedValueOnce(new Error('offline again'));
        let picks = 0;
        const storeSettings = vi.fn(async (_context: SyncContext, choice?: StoreSettingsChoice) => {
          if (!choice) throw new StoreSettingsError('choice_required', 'pick a country', choices);
          if (picks++ === 0) throw new StoreSettingsError('failed', 'pick failed');
          return settings;
        });
        const connector = { storeSettings, capabilities } as unknown as TallyConnector;
        const { result } = track(connector);
        await act(async () => {});
        expect(result.current.state).toBe('error');
        await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
        expect(result.current.state).toBe('choose');
        act(() => result.current.state === 'choose' && result.current.choose({ country: 'de' }));
        await act(async () => {});
        expect(result.current.state).toBe('error');
        act(() => result.current.state === 'error' && result.current.retry());
        await act(async () => {});
        expect(result.current.state).toBe('error');
        if (result.current.state === 'error') expect(result.current.nextRetryAt).toBe(Date.now() + 5_000);
        expect(capabilities).toHaveBeenCalledTimes(3);
      });

      it('resets the backoff after success before a new failure', async () => {
        const capabilities = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ orderCreate: 3, taxRounding: vendure }).mockRejectedValueOnce(new Error('offline again'));
        const connector = withCapabilities(capabilities);
        const { result, rerender } = renderHook(
          ({ ctx }: { ctx: SyncContext }) => useStoreSettings({ connector, context: ctx, loadChoice: () => undefined, saveChoice: vi.fn() }),
          { initialProps: { ctx: context } },
        );
        await act(async () => {});
        expect(result.current.state).toBe('error');
        if (result.current.state !== 'error') return;
        act(() => result.current.state === 'error' && result.current.retry());
        await act(async () => {});
        expect(result.current.state).toBe('ready');
        rerender({ ctx: { ...context, baseUrl: 'https://other.test' } });
        await act(async () => {});
        expect(result.current.state).toBe('error');
        if (result.current.state === 'error') expect(result.current.nextRetryAt).toBe(105_000);
        expect(capabilities).toHaveBeenCalledTimes(3);
      });
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

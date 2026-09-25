import { describe, it, expect, vi } from 'vitest';
import { StoreSettingsError } from '@tallyui/core';
import type { StoreSettings, StoreSettingsChoice, SyncContext, TallyConnector } from '@tallyui/core';
import { resolveStoreSettings } from './resolve-store-settings';
import { withPricingContext, taxProviderProps } from './map-store-settings';

const context: SyncContext = { connectorId: 'fake', baseUrl: 'https://store.test', headers: {} };
const settings: StoreSettings = { currency: 'EUR', pricesIncludeTax: true, taxRatesPpm: { default: 190000 } };
const choices = { regions: [{ id: 'r1', name: 'One' }, { id: 'r2', name: 'Two' }] };

/** A connector with just the member these helpers read; `undefined` leaves storeSettings out. */
function fakeConnector(storeSettings?: TallyConnector['storeSettings']): TallyConnector {
  return { storeSettings } as unknown as TallyConnector;
}

function setup(storeSettings?: TallyConnector['storeSettings'], stored?: StoreSettingsChoice) {
  const loadChoice = vi.fn(() => stored);
  const saveChoice = vi.fn();
  const connector = fakeConnector(storeSettings);
  return { options: { connector, context, loadChoice, saveChoice }, loadChoice, saveChoice };
}

describe('resolveStoreSettings', () => {
  it('is ready with no choice when the store needs none', async () => {
    const storeSettings = vi.fn(async () => settings);
    const { options, saveChoice } = setup(storeSettings);

    await expect(resolveStoreSettings(options)).resolves.toEqual({ status: 'ready', settings });
    expect(storeSettings).toHaveBeenCalledWith(context, undefined);
    expect(saveChoice).not.toHaveBeenCalled();
  });

  it('uses the stored choice and does not re-save it', async () => {
    const storeSettings = vi.fn(async () => settings);
    const { options, loadChoice, saveChoice } = setup(storeSettings, { region: 'r1' });

    await expect(resolveStoreSettings(options)).resolves.toEqual({ status: 'ready', settings, choice: { region: 'r1' } });
    expect(loadChoice).toHaveBeenCalledOnce();
    expect(storeSettings).toHaveBeenCalledWith(context, { region: 'r1' });
    expect(saveChoice).not.toHaveBeenCalled();
  });

  it('an argument choice wins over the stored one and is saved on success', async () => {
    const storeSettings = vi.fn(async () => settings);
    const { options, loadChoice, saveChoice } = setup(storeSettings, { region: 'r1' });

    await expect(resolveStoreSettings(options, { region: 'r2' })).resolves.toEqual({ status: 'ready', settings, choice: { region: 'r2' } });
    expect(loadChoice).not.toHaveBeenCalled();
    expect(storeSettings).toHaveBeenCalledWith(context, { region: 'r2' });
    expect(saveChoice).toHaveBeenCalledExactlyOnceWith({ region: 'r2' });
  });

  it('choice_required gives choose, with the tried choice as initial, and saves nothing', async () => {
    const storeSettings = vi.fn(async () => {
      throw new StoreSettingsError('choice_required', 'pick one', choices);
    });
    const stale = setup(storeSettings, { region: 'gone' });
    await expect(resolveStoreSettings(stale.options)).resolves.toEqual({ status: 'choose', choices, initial: { region: 'gone' } });

    const fresh = setup(storeSettings);
    await expect(resolveStoreSettings(fresh.options, { region: 'r9' })).resolves.toEqual({ status: 'choose', choices, initial: { region: 'r9' } });

    const none = setup(storeSettings);
    await expect(resolveStoreSettings(none.options)).resolves.toEqual({ status: 'choose', choices });

    expect(stale.saveChoice).not.toHaveBeenCalled();
    expect(fresh.saveChoice).not.toHaveBeenCalled();
  });

  it('rethrows failed, and any other error, unchanged without saving', async () => {
    const failed = new StoreSettingsError('failed', 'network');
    const failing = setup(vi.fn(async () => Promise.reject(failed)));
    await expect(resolveStoreSettings(failing.options, { region: 'r1' })).rejects.toBe(failed);
    expect(failing.saveChoice).not.toHaveBeenCalled();

    const other = new TypeError('boom');
    await expect(resolveStoreSettings(setup(vi.fn(async () => Promise.reject(other))).options)).rejects.toBe(other);
  });

  it('is unsupported, with no calls, when the connector has no storeSettings', async () => {
    const { options, loadChoice, saveChoice } = setup(undefined, { region: 'r1' });

    await expect(resolveStoreSettings(options, { region: 'r2' })).resolves.toEqual({ status: 'unsupported' });
    expect(loadChoice).not.toHaveBeenCalled();
    expect(saveChoice).not.toHaveBeenCalled();
  });
});

describe('withPricingContext', () => {
  it('adds the settings pricing context to the sync context', () => {
    const pricingContext = { region_id: 'r1' };
    expect(withPricingContext(context, { ...settings, pricingContext })).toEqual({ ...context, pricingContext });
  });

  it('leaves the key out when the settings have none, even if the context had one', () => {
    const result = withPricingContext({ ...context, pricingContext: { region_id: 'old' } }, settings);
    expect(result).toEqual(context);
    expect('pricingContext' in result).toBe(false);
  });
});

describe('taxProviderProps', () => {
  it('maps the rates and tax inclusivity', () => {
    expect(taxProviderProps(settings)).toEqual({ ratesPpm: { default: 190000 }, pricesIncludeTax: true });
  });
});

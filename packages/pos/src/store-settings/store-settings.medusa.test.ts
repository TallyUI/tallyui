import { afterEach, describe, it, expect, vi } from 'vitest';
import type { StoreSettingsChoice, SyncContext } from '@tallyui/core';
import { medusaConnector } from '@tallyui/connector-medusa';
import fixture from '@tallyui/connector-medusa/store-settings.fixture.json';
import { resolveStoreSettings } from './resolve-store-settings';
import { withPricingContext, taxProviderProps } from './map-store-settings';

// End to end with the real connector, through a stubbed fetch serving TV4b's recorded medusa-dev fixture.
const context: SyncContext = { connectorId: 'medusa', baseUrl: 'https://medusa.test', headers: { Authorization: 'Basic abc' } };
const ok = (body: unknown) => new Response(JSON.stringify(body));

/** The connector's request order: the four parallel reads, then the tax-regions read once a country resolves. */
function serveFixture(withCountry: boolean) {
  const spy = vi.spyOn(globalThis, 'fetch');
  const bodies = [fixture.stores, fixture.regions, fixture.pricePreferences, fixture.apiKeys, ...(withCountry ? [fixture.taxRegionsDe] : [])];
  for (const body of bodies) spy.mockResolvedValueOnce(ok(body));
  return spy;
}

describe('resolveStoreSettings with medusaConnector', () => {
  afterEach(() => vi.restoreAllMocks());

  it('asks for a choice with nothing stored, then resolves and saves the pick', async () => {
    const saveChoice = vi.fn();
    const options = { connector: medusaConnector, context, loadChoice: () => undefined, saveChoice };

    serveFixture(false);
    const first = await resolveStoreSettings(options);
    expect(first.status).toBe('choose');
    if (first.status !== 'choose') return;
    expect(first.choices.countries).toHaveLength(7);
    expect(first.choices.channels).toEqual([{ id: 'apk_01M35QW18NZZWSJGQ5XSPND3AJ', name: 'Default Sales Channel' }]);
    expect(first.initial).toBeUndefined();
    expect(saveChoice).not.toHaveBeenCalled();

    const choice: StoreSettingsChoice = { country: 'de', channel: first.choices.channels![0]!.id };
    serveFixture(true);
    const second = await resolveStoreSettings(options, choice);
    expect(second.status).toBe('ready');
    if (second.status !== 'ready') return;
    const pricingContext = { region_id: 'reg_01M35QW1ACR84WNR3T0SVK6M1C', currency_code: 'eur', publishable_key: 'pk_test_fixture' };
    expect(second.settings).toMatchObject({ currency: 'EUR', pricingContext });
    expect(second.choice).toEqual(choice);
    expect(saveChoice).toHaveBeenCalledExactlyOnceWith(choice);

    expect(withPricingContext(context, second.settings)).toEqual({ ...context, pricingContext });
    expect(taxProviderProps(second.settings)).toEqual({ ratesPpm: { default: 0 }, pricesIncludeTax: false });
  });
});

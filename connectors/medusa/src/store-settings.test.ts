import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError, StoreSettingsError } from '@tallyui/core';
import type { SyncContext } from '@tallyui/core';

import { medusaStoreSettings } from './store-settings';
import { medusaConnector } from './index';
import fixture from './store-settings.fixture.json';

const context: SyncContext = { connectorId: 'medusa', baseUrl: 'https://medusa.test', headers: { Authorization: 'Basic abc' } };

const ok = (body: unknown) => new Response(JSON.stringify(body));
const store = (default_region_id: string | null = null, id = 'store_1') => ok({ stores: [{ id, default_region_id }] });
const regions = (list: Array<{ id: string; name?: string; currency_code?: string; countries?: Array<{ iso_2: string }> }>) =>
  ok({ regions: list.map((r) => ({ name: 'Region', currency_code: 'eur', countries: [{ iso_2: 'de' }], ...r })) });
const pricePreferences = (list: Array<Record<string, unknown>> = []) => ok({ price_preferences: list });
const apiKeys = (
  list: Array<{ id: string; title?: string; token?: string; revoked_at?: string | null; sales_channels?: Array<{ id: string; name: string }> }>,
) => ok({ api_keys: list.map((k) => ({ title: 'Key', token: 'pk_x', revoked_at: null, ...k })) });
const taxRegions = (list: Array<Record<string, unknown>> = []) => ok({ tax_regions: list });

const emptyPage = () => ok({ tax_regions: [], count: 0, offset: 0, limit: 100 });

/**
 * Serves each read by its URL. The arguments are, in order, the four parallel reads and the
 * country's tax-regions read; `allPages` are the pages of the all-tax-regions read (#673), by
 * offset / 100, one empty page by default. Any other request rejects.
 */
function routeFetch(responses: Response[], allPages: Response[] = [emptyPage()]) {
  const [storesRes, regionsRes, pricePrefRes, apiKeysRes, countryTaxRegionsRes] = responses;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input));
    const offset = url.searchParams.get('offset');
    const response =
      url.pathname === '/admin/tax-regions'
        ? offset !== null
          ? allPages[Number(offset) / 100]
          : countryTaxRegionsRes
        : { '/admin/stores': storesRes, '/admin/regions': regionsRes, '/admin/price-preferences': pricePrefRes, '/admin/api-keys': apiKeysRes }[url.pathname];
    if (!response) throw new Error(`Unexpected request: ${url}`);
    return response;
  });
}

function mockFetch(...responses: Response[]) {
  return routeFetch(responses);
}

const requestUrls = (spy: ReturnType<typeof routeFetch>) => spy.mock.calls.map(([input]) => String(input));

describe('medusaStoreSettings', () => {
  afterEach(() => vi.restoreAllMocks());

  it("is wired as the connector's storeSettings", () => {
    expect(medusaConnector.storeSettings).toBe(medusaStoreSettings);
  });

  it('matches the recorded medusa-dev shape with no choice: choice_required, 7 countries and one channel', async () => {
    mockFetch(ok(fixture.stores), ok(fixture.regions), ok(fixture.pricePreferences), ok(fixture.apiKeys));

    await expect(medusaStoreSettings(context)).rejects.toMatchObject({
      code: 'choice_required',
      choices: {
        countries: ['dk', 'fr', 'de', 'it', 'es', 'se', 'gb'],
        channels: [{ id: 'apk_01M35QW18NZZWSJGQ5XSPND3AJ', name: 'Default Sales Channel' }],
      },
    });
  });

  it("matches the recorded medusa-dev shape with { country: 'de' }", async () => {
    mockFetch(ok(fixture.stores), ok(fixture.regions), ok(fixture.pricePreferences), ok(fixture.apiKeys), ok(fixture.taxRegionsDe));

    await expect(medusaStoreSettings(context, { country: 'de' })).resolves.toEqual({
      currency: 'EUR',
      pricesIncludeTax: false,
      taxRatesPpm: { default: 0 },
      pricingContext: { region_id: 'reg_01M35QW1ACR84WNR3T0SVK6M1C', currency_code: 'eur', publishable_key: 'pk_test_fixture' },
      allTaxRates: [],
    });
  });

  it('default_region_id wins over falling back to a single-region shortcut', async () => {
    mockFetch(
      store('reg_b'),
      regions([{ id: 'reg_a' }, { id: 'reg_b', currency_code: 'usd' }]),
      pricePreferences(),
      apiKeys([{ id: 'k1' }]),
      taxRegions(),
    );

    await expect(medusaStoreSettings(context, { country: 'de' })).resolves.toMatchObject({ currency: 'USD' });
  });

  it('a chosen country outside a single-country region gives choice_required, never the only country (money bug regression)', async () => {
    mockFetch(store(null), regions([{ id: 'reg_a', countries: [{ iso_2: 'de' }] }]), pricePreferences(), apiKeys([{ id: 'k1' }]));

    await expect(medusaStoreSettings(context, { country: 'dk' })).rejects.toMatchObject({
      code: 'choice_required',
      message: "the chosen country isn't in this region; choose a country",
      choices: { countries: ['de'] },
    });
  });

  it('a single-country region with no country chosen still resolves ready', async () => {
    mockFetch(store(null), regions([{ id: 'reg_a' }]), pricePreferences(), apiKeys([{ id: 'k1' }]), taxRegions());

    await expect(medusaStoreSettings(context)).resolves.toMatchObject({ currency: 'EUR' });
  });

  it('a chosen country matches the single region country case-insensitively', async () => {
    mockFetch(store(null), regions([{ id: 'reg_a' }]), pricePreferences(), apiKeys([{ id: 'k1' }]), taxRegions());

    await expect(medusaStoreSettings(context, { country: 'DE' })).resolves.toMatchObject({ currency: 'EUR' });
  });

  it('a multi-country region with an unmatched country still gives choice_required', async () => {
    mockFetch(store(null), regions([{ id: 'reg_a', countries: [{ iso_2: 'de' }, { iso_2: 'fr' }] }]), pricePreferences(), apiKeys([{ id: 'k1' }]));

    await expect(medusaStoreSettings(context, { country: 'dk' })).rejects.toMatchObject({
      code: 'choice_required',
      choices: { countries: ['de', 'fr'] },
    });
  });

  it('two regions and no choice give choice_required with regions', async () => {
    mockFetch(store(null), regions([{ id: 'reg_a', name: 'A' }, { id: 'reg_b', name: 'B' }]), pricePreferences(), apiKeys([{ id: 'k1' }]));

    await expect(medusaStoreSettings(context)).rejects.toMatchObject({
      code: 'choice_required',
      choices: { regions: [{ id: 'reg_a', name: 'A' }, { id: 'reg_b', name: 'B' }] },
    });
  });

  it('a deleted chosen region gives choice_required, not failed', async () => {
    mockFetch(store(null), regions([{ id: 'reg_a' }, { id: 'reg_b' }]), pricePreferences(), apiKeys([{ id: 'k1' }]));

    await expect(medusaStoreSettings(context, { region: 'reg_gone' })).rejects.toMatchObject({ code: 'choice_required' });
  });

  it('a region preference wins over a currency preference', async () => {
    mockFetch(
      store(null),
      regions([{ id: 'reg_a', currency_code: 'eur' }]),
      pricePreferences([
        { attribute: 'currency_code', value: 'eur', is_tax_inclusive: true },
        { attribute: 'region_id', value: 'reg_a', is_tax_inclusive: false },
      ]),
      apiKeys([{ id: 'k1' }]),
      taxRegions(),
    );

    await expect(medusaStoreSettings(context, { country: 'de' })).resolves.toMatchObject({ pricesIncludeTax: false });
  });

  it('a default rate of 8.375 gives 83750, and every value is an integer', async () => {
    mockFetch(
      store(null),
      regions([{ id: 'reg_a' }]),
      pricePreferences(),
      apiKeys([{ id: 'k1' }]),
      taxRegions([{ country_code: 'de', province_code: null, tax_rates: [{ rate: 8.375, is_default: true }] }]),
    );

    const settings = await medusaStoreSettings(context, { country: 'de' });
    expect(settings.taxRatesPpm).toEqual({ default: 83750 });
    expect(Object.values(settings.taxRatesPpm).every(Number.isInteger)).toBe(true);
  });

  it('a rate with rules is ignored', async () => {
    mockFetch(
      store(null),
      regions([{ id: 'reg_a' }]),
      pricePreferences(),
      apiKeys([{ id: 'k1' }]),
      taxRegions([{ country_code: 'de', province_code: null, tax_rates: [{ rate: 10, is_default: true, rules: [{ reference: 'product' }] }] }]),
    );

    const settings = await medusaStoreSettings(context, { country: 'de' });
    expect(settings.taxRatesPpm).toEqual({ default: 0 });
  });

  it('a province-level tax region is ignored', async () => {
    mockFetch(
      store(null),
      regions([{ id: 'reg_a' }]),
      pricePreferences(),
      apiKeys([{ id: 'k1' }]),
      taxRegions([
        { country_code: 'de', province_code: 'BY', tax_rates: [{ rate: 99, is_default: true }] },
        { country_code: 'de', province_code: null, tax_rates: [] },
      ]),
    );

    const settings = await medusaStoreSettings(context, { country: 'de' });
    expect(settings.taxRatesPpm).toEqual({ default: 0 });
  });

  it('two keys and no choice give choice_required with channels', async () => {
    mockFetch(
      store(null),
      regions([{ id: 'reg_a', countries: [{ iso_2: 'de' }] }]),
      pricePreferences(),
      apiKeys([{ id: 'k1', title: 'One' }, { id: 'k2', title: 'Two' }]),
      taxRegions(),
    );

    await expect(medusaStoreSettings(context)).rejects.toMatchObject({
      code: 'choice_required',
      choices: { channels: [{ id: 'k1', name: 'One' }, { id: 'k2', name: 'Two' }] },
    });
  });

  it('a key with two sales channels joins their names with ", "', async () => {
    mockFetch(
      store(null),
      regions([{ id: 'reg_a', countries: [{ iso_2: 'de' }] }]),
      pricePreferences(),
      apiKeys([{ id: 'k1', sales_channels: [{ id: 'sc_a', name: 'A' }, { id: 'sc_b', name: 'B' }] }, { id: 'k2', title: 'Two' }]),
      taxRegions(),
    );

    await expect(medusaStoreSettings(context)).rejects.toMatchObject({
      choices: { channels: [{ id: 'k1', name: 'A, B' }, { id: 'k2', name: 'Two' }] },
    });
  });

  it('a key with no sales channels falls back to its title', async () => {
    mockFetch(
      store(null),
      regions([{ id: 'reg_a', countries: [{ iso_2: 'de' }] }]),
      pricePreferences(),
      apiKeys([{ id: 'k1', title: 'Fallback Title', sales_channels: [] }, { id: 'k2', title: 'Two' }]),
      taxRegions(),
    );

    await expect(medusaStoreSettings(context)).rejects.toMatchObject({
      choices: { channels: [{ id: 'k1', name: 'Fallback Title' }, { id: 'k2', name: 'Two' }] },
    });
  });

  it('a key with a blank channel name falls back to its title', async () => {
    mockFetch(
      store(null),
      regions([{ id: 'reg_a', countries: [{ iso_2: 'de' }] }]),
      pricePreferences(),
      apiKeys([{ id: 'k1', title: 'Fallback Title', sales_channels: [{ id: 'sc_a', name: '  ' }] }, { id: 'k2', title: 'Two' }]),
      taxRegions(),
    );

    await expect(medusaStoreSettings(context)).rejects.toMatchObject({
      choices: { channels: [{ id: 'k1', name: 'Fallback Title' }, { id: 'k2', name: 'Two' }] },
    });
  });

  it('a revoked key is excluded, resolving to the only remaining one', async () => {
    mockFetch(
      store(null),
      regions([{ id: 'reg_a', countries: [{ iso_2: 'de' }] }]),
      pricePreferences(),
      apiKeys([{ id: 'k1', token: 'pk_revoked', revoked_at: '2026-01-01T00:00:00Z' }, { id: 'k2', token: 'pk_live' }]),
      taxRegions(),
    );

    const settings = await medusaStoreSettings(context);
    expect(settings.pricingContext?.publishable_key).toBe('pk_live');
  });

  it('no keys gives failed, with the exact message', async () => {
    mockFetch(store(null), regions([{ id: 'reg_a' }]), pricePreferences(), apiKeys([]), taxRegions());

    await expect(medusaStoreSettings(context)).rejects.toMatchObject({
      code: 'failed',
      message: 'Medusa has no publishable API key; create one in the admin',
    });
  });

  it('a non-OK response gives failed', async () => {
    const failing = () => new Response(JSON.stringify({ message: 'nope' }), { status: 500 });
    mockFetch(failing(), failing(), failing(), failing());

    const error = await medusaStoreSettings(context).catch((e) => e);
    expect(error).toBeInstanceOf(StoreSettingsError);
    expect(error).toMatchObject({ code: 'failed' });
  });

  it('never leaks the publishable key token, in a choice_required or a failed error, or on the console', async () => {
    const consoleSpies = ['log', 'warn', 'error', 'info', 'debug'].map((m) => vi.spyOn(console, m as 'log'));
    const token = 'pk_super_secret_token';

    // choice_required: ambiguous country, one channel whose token must not leak.
    mockFetch(store(null), regions([{ id: 'reg_a', countries: [{ iso_2: 'de' }, { iso_2: 'fr' }] }]), pricePreferences(), apiKeys([{ id: 'k1', token }]));
    const choiceError = await medusaStoreSettings(context).catch((e) => e);
    expect(choiceError).toBeInstanceOf(StoreSettingsError);
    expect(choiceError.message).not.toContain(token);
    expect(JSON.stringify(choiceError.choices)).not.toContain(token);

    // failed while the key is loaded: the tax-region request fails after the keys were read.
    const failing = new Response(JSON.stringify({ message: 'tax regions unavailable' }), { status: 500 });
    mockFetch(store(null), regions([{ id: 'reg_a', countries: [{ iso_2: 'de' }] }]), pricePreferences(), apiKeys([{ id: 'k1', token }]), failing);
    const failedError = await medusaStoreSettings(context).catch((e) => e);
    expect(failedError).toMatchObject({ code: 'failed' });
    expect(failedError).toBeInstanceOf(StoreSettingsError);
    expect(failedError.message).not.toContain(token);

    for (const spy of consoleSpies) {
      for (const call of spy.mock.calls) expect(call.join(' ')).not.toContain(token);
    }
  });
});

// #673: every tax region's rates, for an app's "View all tax rates" table. Display only.
describe('medusaStoreSettings allTaxRates', () => {
  afterEach(() => vi.restoreAllMocks());

  const fixtureReads = () => [ok(fixture.stores), ok(fixture.regions), ok(fixture.pricePreferences), ok(fixture.apiKeys), ok(fixture.taxRegionsDe)];
  const allFields = 'fields=id,country_code,province_code,parent_id,*tax_rates,*tax_rates.rules';

  it('T1: lists every region rate in order, with rules, the province as region, and no null rate', async () => {
    routeFetch(fixtureReads(), [ok(fixture.taxRegionsAll)]);

    const settings = await medusaStoreSettings(context, { country: 'de' });
    expect(settings.allTaxRates).toStrictEqual([
      { id: 'txr_de_standard', name: 'Germany', rate: '19', location: { country: 'de' } },
      {
        id: 'txr_de_books', name: 'Books', rate: '7', location: { country: 'de' },
        rules: [{ reference: 'product_type', referenceId: 'ptyp_books' }],
      },
      { id: 'txr_de_by', name: 'Bavaria', rate: '2', location: { country: 'de', region: 'by' } },
      { id: 'txr_fr_standard', name: 'FR-STANDARD', rate: '20', location: { country: 'fr' } },
    ]);
  });

  it('T2: pages by offset until the count is reached, and no further', async () => {
    const region = (i: number) => ({ id: `txreg_${i}`, country_code: 'de', province_code: null, parent_id: null, tax_rates: [] });
    const page = (from: number, length: number) => ok({ tax_regions: Array.from({ length }, (_, i) => region(from + i)), count: 150, offset: from, limit: 100 });
    const spy = routeFetch(fixtureReads(), [page(0, 100), page(100, 50)]);

    await medusaStoreSettings(context, { country: 'de' });
    expect(requestUrls(spy).filter((url) => url.includes('offset='))).toEqual([
      `https://medusa.test/admin/tax-regions?limit=100&offset=0&${allFields}`,
      `https://medusa.test/admin/tax-regions?limit=100&offset=100&${allFields}`,
    ]);
  });

  it("T3: keeps what the cart reads byte-identical for the fixture with { country: 'de' }", async () => {
    routeFetch(fixtureReads(), [ok(fixture.taxRegionsAll)]);

    const { taxRatesPpm, pricesIncludeTax, currency, pricingContext } = await medusaStoreSettings(context, { country: 'de' });
    // Captured from 5c4468e8, before `allTaxRates` existed for Medusa.
    expect(JSON.stringify({ taxRatesPpm, pricesIncludeTax, currency, pricingContext })).toBe(
      '{"taxRatesPpm":{"default":0},"pricesIncludeTax":false,"currency":"EUR",'
      + '"pricingContext":{"region_id":"reg_01M35QW1ACR84WNR3T0SVK6M1C","currency_code":"eur","publishable_key":"pk_test_fixture"}}',
    );
  });

  it('T4: a choice_required path makes no all-tax-regions request', async () => {
    const spy = routeFetch([ok(fixture.stores), ok(fixture.regions), ok(fixture.pricePreferences), ok(fixture.apiKeys)], [ok(fixture.taxRegionsAll)]);

    await expect(medusaStoreSettings(context)).rejects.toMatchObject({ code: 'choice_required' });
    expect(requestUrls(spy).some((url) => url.includes('offset='))).toBe(false);
  });

  it('T5: a 401 on the all-tax-regions read rejects with ConnectorUnauthorizedError', async () => {
    routeFetch(fixtureReads(), [new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 })]);

    await expect(medusaStoreSettings(context, { country: 'de' })).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
  });
});

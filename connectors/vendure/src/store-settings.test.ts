import { afterEach, describe, expect, it, vi } from 'vitest';
import { StoreSettingsError } from '@tallyui/core';
import type { SyncContext } from '@tallyui/core';

import { vendureStoreSettings } from './store-settings';
import { createVendureConnector } from './index';
import fixture from './store-settings.fixture.json';

const context: SyncContext = { connectorId: 'vendure', baseUrl: 'https://vendure.test', headers: { 'vendure-token': 'default-channel' } };

const activeChannel = (over: Partial<{ defaultCurrencyCode: string; pricesIncludeTax: boolean; defaultTaxZone: { id: string } | null }> = {}) => ({
  defaultCurrencyCode: 'USD', pricesIncludeTax: false, defaultTaxZone: { id: '1' }, ...over,
});
const channelBody = (categories: Array<{ id: string; isDefault: boolean }>, channel = activeChannel()) =>
  new Response(JSON.stringify({ data: { activeChannel: channel, taxCategories: { items: categories } } }));
const ratesBody = (items: Array<Record<string, unknown>>) =>
  new Response(JSON.stringify({ data: { taxRates: { items } } }));
const rate = (value: number, categoryId: string, over: Partial<{ enabled: boolean; customerGroup: { id: string } | null }> = {}) =>
  ({ enabled: true, value, category: { id: categoryId }, customerGroup: null, ...over });

describe('vendureStoreSettings', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is wired as the connector\'s storeSettings, and the "until TV4" note is gone', () => {
    expect(createVendureConnector().storeSettings).toBe(vendureStoreSettings);
  });

  it('matches the recorded vendure-dev response (no default category, falls back to items[0])', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(fixture.channelAndCategories)))
      .mockResolvedValueOnce(new Response(JSON.stringify(fixture.taxRates)));

    await expect(vendureStoreSettings(context)).resolves.toEqual({
      currency: 'USD',
      pricesIncludeTax: false,
      taxRatesPpm: { default: 250000, '1': 250000, '2': 70000 },
    });
  });

  it('an isDefault category wins over items[0]', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(channelBody([{ id: '1', isDefault: false }, { id: '2', isDefault: true }]))
      .mockResolvedValueOnce(ratesBody([rate(25, '1'), rate(7, '2')]));

    const settings = await vendureStoreSettings(context);
    expect(settings.taxRatesPpm.default).toBe(70000);
  });

  it('rounds a decimal rate to integer ppm, and every value is an integer', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(channelBody([{ id: '1', isDefault: true }]))
      .mockResolvedValueOnce(ratesBody([rate(8.375, '1')]));

    const settings = await vendureStoreSettings(context);
    expect(settings.taxRatesPpm).toEqual({ default: 83750, '1': 83750 });
    expect(Object.values(settings.taxRatesPpm).every(Number.isInteger)).toBe(true);
  });

  it('ignores a customer-group rate and a disabled rate', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(channelBody([{ id: '1', isDefault: true }]))
      .mockResolvedValueOnce(ratesBody([
        rate(25, '1'),
        rate(99, '1', { customerGroup: { id: 'vip' } }),
        rate(50, '2', { enabled: false }),
      ]));

    const settings = await vendureStoreSettings(context);
    expect(settings.taxRatesPpm).toEqual({ default: 250000, '1': 250000 });
  });

  it('gives default: 0 when the default category has no rate in the zone', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(channelBody([{ id: '1', isDefault: true }, { id: '2', isDefault: false }]))
      .mockResolvedValueOnce(ratesBody([rate(7, '2')]));

    const settings = await vendureStoreSettings(context);
    expect(settings.taxRatesPpm).toEqual({ default: 0, '2': 70000 });
  });

  it('gives default: 0 when there are no tax categories at all', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(channelBody([]))
      .mockResolvedValueOnce(ratesBody([]));

    const settings = await vendureStoreSettings(context);
    expect(settings.taxRatesPpm).toEqual({ default: 0 });
  });

  it('rejects a non-OK response as StoreSettingsError(failed)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 500 }));
    await expect(vendureStoreSettings(context)).rejects.toBeInstanceOf(StoreSettingsError);
    await expect(vendureStoreSettings(context)).rejects.toMatchObject({ code: 'failed' });
  });

  it('rejects a GraphQL errors body as StoreSettingsError(failed)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ message: 'Forbidden' }] })));
    await expect(vendureStoreSettings(context)).rejects.toMatchObject({ code: 'failed', message: expect.stringContaining('Forbidden') });
  });

  it('sends the zone id the first response gave as the second request\'s variable', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(channelBody([{ id: '1', isDefault: true }], activeChannel({ defaultTaxZone: { id: 'zone-42' } })))
      .mockResolvedValueOnce(ratesBody([]));

    await vendureStoreSettings(context);

    const secondCallBody = JSON.parse(fetch.mock.calls[1]![1]!.body as string);
    expect(secondCallBody.variables).toEqual({ zoneId: 'zone-42' });
  });

  it('has no pricingContext, and returns currency and pricesIncludeTax from the channel', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(channelBody([{ id: '1', isDefault: true }], activeChannel({ defaultCurrencyCode: 'EUR', pricesIncludeTax: true })))
      .mockResolvedValueOnce(ratesBody([]));

    const settings = await vendureStoreSettings(context);
    expect(settings.currency).toBe('EUR');
    expect(settings.pricesIncludeTax).toBe(true);
    expect(settings.pricingContext).toBeUndefined();
  });

  it('ignores the choice parameter', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(channelBody([{ id: '1', isDefault: true }]))
      .mockResolvedValueOnce(ratesBody([rate(25, '1')]));

    const settings = await vendureStoreSettings(context, { region: 'anything', country: 'anything', channel: 'anything' });
    expect(settings.currency).toBe('USD');
  });
});

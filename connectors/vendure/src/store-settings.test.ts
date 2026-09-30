import { afterEach, describe, expect, it, vi } from 'vitest';
import { StoreSettingsError } from '@tallyui/core';
import type { SyncContext } from '@tallyui/core';

import { vendureStoreSettings } from './store-settings';
import { createVendureConnector } from './index';
import fixture from './store-settings.fixture.json';
import { renderHook } from '@testing-library/react';
import { createOrderBuilder, TaxProvider, taxLogger, useTax } from '@tallyui/pos';
import { vendureProductTraits } from './traits/product';

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

  it('uses the tax rate names by category id and the isDefault category for default', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(channelBody([{ id: '1', isDefault: false }, { id: '2', isDefault: true }]))
      .mockResolvedValueOnce(ratesBody([{ ...rate(25, '1'), name: 'Standard' }, { ...rate(7, '2'), name: 'Reduced' }]));

    const settings = await vendureStoreSettings(context);
    expect(settings.taxRateCodes).toEqual({ default: 'Reduced', '1': 'Standard', '2': 'Reduced' });
  });

  it('omits filtered, rateless, and nameless categories from taxRateCodes', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(channelBody([
        { id: '1', isDefault: true }, { id: '2', isDefault: false }, { id: '3', isDefault: false },
        { id: '4', isDefault: false }, { id: '5', isDefault: false }, { id: '6', isDefault: false },
      ]))
      .mockResolvedValueOnce(ratesBody([
        { ...rate(25, '2'), name: 'Standard' },
        { ...rate(50, '3', { enabled: false }), name: 'Disabled' },
        { ...rate(99, '4', { customerGroup: { id: 'vip' } }), name: 'VIP' },
        { ...rate(6, '5'), name: 'Earlier' },
        { ...rate(7, '5'), name: '' },
        { ...rate(8, '6'), name: 42 },
      ]));

    const settings = await vendureStoreSettings(context);
    expect(settings.taxRateCodes).toEqual({ '2': 'Standard' });
  });

  it('requests name but omits taxRateCodes when the response has none', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(channelBody([{ id: '1', isDefault: true }]))
      .mockResolvedValueOnce(ratesBody([rate(25, '1')]));

    const settings = await vendureStoreSettings(context);
    expect(settings).not.toHaveProperty('taxRateCodes');
    const secondCallBody = JSON.parse(fetch.mock.calls[1]![1]!.body as string);
    expect(secondCallBody.query).toMatch(/items\s*\{\s*name\b/);
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
    expect(settings.taxRatesPpm).toEqual({ default: 0, '1': 0, '2': 70000 });
  });

  it('a category with no rate in the zone maps to 0, and a line in it is taxed 0 with no warning (#288)', async () => {
    // The recorded categories 1 and 2, with the recorded zone rates minus category 2's.
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(fixture.channelAndCategories)))
      .mockResolvedValueOnce(ratesBody(fixture.taxRates.data.taxRates.items.filter((item) => item.category.id !== '2')));
    const settings = await vendureStoreSettings(context);
    // TaxProvider called as the wrapper's own render (this package has no React types to import).
    const wrapper = ({ children }: { children?: unknown }) =>
      TaxProvider({ ratesPpm: settings.taxRatesPpm, pricesIncludeTax: false, children: children as never });
    const builder = createOrderBuilder({ currency: 'USD', taxContext: renderHook(() => useTax(), { wrapper }).result.current });
    const warnings: unknown[] = [];
    taxLogger.addSink({ id: 'vendure-rateless-category', levels: ['warn'], write: (entry) => warnings.push(entry.data) });
    try {
      builder.addProduct({ id: '9', name: 'Gift card', variants: [{ id: '91', price: 5000, currencyCode: 'USD', taxCategory: { id: '2' } }] },
        vendureProductTraits);
    } finally {
      taxLogger.removeSink('vendure-rateless-category');
    }
    expect(builder.getSnapshot().lineItems[0].taxLines).toEqual([{ ratePpm: 0, taxMicros: '0' }]);
    expect(warnings).toEqual([]);
    expect(settings.taxRatesPpm).toEqual({ default: 250000, '1': 250000, '2': 0 });
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

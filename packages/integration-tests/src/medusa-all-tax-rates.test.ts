import { afterEach, expect, it, vi } from 'vitest';
import type { SyncContext } from '@tallyui/core';
import { medusaStoreSettings } from '@tallyui/connector-medusa';
import { taxProviderProps } from '@tallyui/pos';
import fixture from '../../../connectors/medusa/src/store-settings.fixture.json';

afterEach(() => {
  vi.unstubAllGlobals();
});

// #673: the full list is for an app's "View all tax rates" table; the cart's inputs stay as they were.
it('T7: lists every Medusa tax region rate in the settings and never passes the list to the till', async () => {
  const context: SyncContext = { connectorId: 'medusa', baseUrl: 'https://medusa.test', headers: {} };
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/admin/stores') return Response.json(fixture.stores);
    if (url.pathname === '/admin/regions') return Response.json(fixture.regions);
    if (url.pathname === '/admin/price-preferences') return Response.json(fixture.pricePreferences);
    if (url.pathname === '/admin/api-keys') return Response.json(fixture.apiKeys);
    if (url.pathname === '/admin/tax-regions') {
      return Response.json(url.searchParams.has('offset') ? fixture.taxRegionsAll : fixture.taxRegionsDe);
    }
    throw new Error(`Unexpected request: ${url}`);
  }));

  const settings = await medusaStoreSettings(context, { country: 'de' });
  expect(settings.allTaxRates?.map((rate) => rate.id)).toEqual(['txr_de_standard', 'txr_de_books', 'txr_de_by', 'txr_fr_standard']);

  expect(taxProviderProps(settings)).toStrictEqual(taxProviderProps({ ...settings, allTaxRates: undefined }));
});

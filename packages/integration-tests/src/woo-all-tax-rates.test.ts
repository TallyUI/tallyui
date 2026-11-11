import { afterEach, expect, it, vi } from 'vitest';
import type { SyncContext } from '@tallyui/core';
import { wooStoreSettings } from '@tallyui/connector-woocommerce';
import { taxProviderProps } from '@tallyui/pos';
import stores from '../../../connectors/woocommerce/src/__tests__/fixtures/taxes-1.10.20/stores.json';
import taxes from '../../../connectors/woocommerce/src/__tests__/fixtures/taxes-1.10.20/taxes.json';
import classes from '../../../connectors/woocommerce/src/__tests__/fixtures/taxes-1.10.20/tax-classes.json';

afterEach(() => {
  vi.unstubAllGlobals();
});

// #669: the full list is for an app's "View all tax rates" table; the cart's inputs stay as they were.
it('lists every WooCommerce rate in the settings and never passes the list to the till', async () => {
  const context: SyncContext = {
    connectorId: 'woocommerce',
    baseUrl: 'https://woo.test/wp-json/wcpos/v2',
    headers: {},
    signal: new AbortController().signal,
  };
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/wp-json/wcpos/v2/stores') return Response.json(stores);
    if (url.pathname === '/wp-json/wcpos/v2/taxes/classes') return Response.json(classes);
    if (url.pathname === '/wp-json/wcpos/v2/taxes') return Response.json(url.searchParams.get('page') === '1' ? taxes : []);
    throw new Error(`Unexpected request: ${url}`);
  }));

  const settings = await wooStoreSettings(context);
  expect(settings.allTaxRates?.map((rate) => [rate.id, rate.taxClass])).toEqual(taxes.map((rate) => [String(rate.id), rate.class]));

  const { allTaxRates: _all, ...withoutList } = settings;
  expect(taxProviderProps(settings)).toStrictEqual(taxProviderProps(withoutList));
});

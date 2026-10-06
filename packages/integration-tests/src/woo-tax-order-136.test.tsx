import type { ReactNode } from 'react';
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { SyncContext } from '@tallyui/core';
import { readWooCapabilities, wooProductTraits, wooStoreSettings } from '@tallyui/connector-woocommerce';
import {
  createOrderBuilder, roundMicrosToMinor, TaxProvider, taxLinesByRate, taxProviderProps, useTax,
} from '@tallyui/pos';
import stores from '../../../connectors/woocommerce/src/__tests__/fixtures/taxes-1.10.20/stores.json';
import taxes from '../../../connectors/woocommerce/src/__tests__/fixtures/taxes-1.10.20/taxes.json';
import classes from '../../../connectors/woocommerce/src/__tests__/fixtures/taxes-1.10.20/tax-classes.json';
import products from '../../../connectors/woocommerce/src/__tests__/fixtures/taxes-1.10.20/products-tax-fields.json';
import request from '../../../connectors/woocommerce/src/__tests__/fixtures/taxes-1.10.20/push-orders-request.json';
import response from '../../../connectors/woocommerce/src/__tests__/fixtures/taxes-1.10.20/push-orders-response.json';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('matches WooCommerce order #136 through connector settings, product traits and the till', async () => {
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
    if (url.pathname === '/wp-json/wcpos/v2/taxes') {
      return Response.json(url.searchParams.get('page') === '1' ? taxes : []);
    }
    throw new Error(`Unexpected request: ${url}`);
  }));

  const settings = await wooStoreSettings(context);
  const capabilities = await readWooCapabilities(context);
  expect(capabilities).toEqual({
    orderCreate: 3,
    taxRounding: { granularity: 'woocommerce', roundAtSubtotal: false },
  });
  const { result } = renderHook(() => useTax(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <TaxProvider {...taxProviderProps({ ...settings, taxRounding: capabilities!.taxRounding })}>
        {children}
      </TaxProvider>
    ),
  });

  const documents = products.map(({ id, sku, price, tax_class, tax_status }) => ({
    uuid: `woo-product-${id}`,
    id,
    sku,
    name: sku,
    type: 'simple',
    status: 'publish',
    price,
    regular_price: price,
    tax_class,
    tax_status,
  }));
  const builder = createOrderBuilder({ currency: settings.currency, taxContext: result.current });
  for (const line of request.payload.line_items) {
    const doc = documents.find((product) => product.id === line.product_id)!;
    builder.addProduct(doc, wooProductTraits, { quantity: line.quantity });
  }

  const snapshot = builder.getSnapshot();
  expect(snapshot).toMatchObject({ subtotalMinor: 3175, taxMinor: 116, totalMinor: 3291 });
  expect(snapshot.lineItems).toHaveLength(response.document.line_items.length);
  for (const expected of response.document.line_items) {
    const line = snapshot.lineItems.find((item) => item.productId === String(expected.product_id))!;
    const taxMicros = line.taxLines.reduce((sum, tax) => sum + BigInt(tax.taxMicros), 0n);
    expect(roundMicrosToMinor(taxMicros), expected.sku).toBe(Number(expected.total_tax) * 100);
  }

  const byRate = taxLinesByRate(
    [...snapshot.lineItems], snapshot.taxMinor, undefined, capabilities!.taxRounding,
  );
  for (const rate of byRate) {
    const expected = response.document.tax_lines.find((line) => line.rate_code === rate.code);
    expect(expected, rate.code).toBeDefined();
    expect(rate.amountMinor, rate.code).toBe(Number(expected!.tax_total) * 100);
  }
  for (const expected of response.document.tax_lines) {
    if (!byRate.some((rate) => rate.code === expected.rate_code)) {
      expect(Number(expected.tax_total), expected.rate_code).toBe(0);
    }
  }
});

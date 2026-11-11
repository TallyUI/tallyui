// @vitest-environment node
// #722 step 2, the front desk's acceptance: a sale taxed on the customer's address, from WooCommerce settings through the till
// to the WooCommerce payload, totals the same as the server's own tax on that payload.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { woocommerceTax, type OrderCreateEnvelope, type SyncContext } from '@tallyui/core';
import { toWooOrderPayload, wooStoreSettings } from '@tallyui/connector-woocommerce';
import { createOrderBuilder, finalizeOrder, saleTaxContexts, toOrderCreateEnvelope, type CustomerSummary } from '@tallyui/pos';
import stores from '../../../connectors/woocommerce/src/__tests__/fixtures/taxes-1.10.20/stores.json';
import classes from '../../../connectors/woocommerce/src/__tests__/fixtures/taxes-1.10.20/tax-classes.json';

afterEach(() => {
  vi.unstubAllGlobals();
});

const rate = (id: number, state: string, percent: string): woocommerceTax.WooTaxRate => ({ id, country: 'US', state, postcode: '', city: '',
  postcodes: [], cities: [], rate: percent, name: `${state} Tax`, priority: 1, compound: false, shipping: true, order: 0, class: 'standard' });
// The base (the store's tax_address, San Francisco CA), a billing state and a shipping state.
const table = [rate(1, 'CA', '7.2500'), rate(2, 'NY', '4.0000'), rate(3, 'TX', '6.2500')];
const base = stores[0].tax_address;

async function settingsFor(taxBasedOn: string) {
  const context: SyncContext = { connectorId: 'woocommerce', baseUrl: 'https://woo.test/wp-json/wcpos/v2', headers: {},
    signal: new AbortController().signal };
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/wp-json/wcpos/v2/stores') return Response.json([{ ...stores[0], calc_taxes: 'yes', tax_based_on: taxBasedOn }]);
    if (url.pathname === '/wp-json/wcpos/v2/taxes/classes') return Response.json(classes);
    if (url.pathname === '/wp-json/wcpos/v2/taxes') return Response.json(url.searchParams.get('page') === '1' ? table : []);
    throw new Error(`Unexpected request: ${url}`);
  }));
  return wooStoreSettings(context);
}

const billing = { firstName: 'Ann', address1: '1 State St', city: 'Albany', state: 'NY', postcode: '12207', country: 'US' };
const shipping = { firstName: 'Ann', city: 'Austin', state: 'TX', postcode: '78701', country: 'US' };

/** The till: the customer's context, a taxable line, a fee and shipping, finalized and sent to WooCommerce. */
async function sell(taxBasedOn: string, customer: CustomerSummary, orderCreateVersion = 8) {
  const { taxContext, location } = saleTaxContexts(await settingsFor(taxBasedOn), { orderCreateVersion })(customer);
  const builder = createOrderBuilder({ currency: 'USD', taxContext });
  builder.addLine({ productId: '11', name: 'Item', unitPrice: { amount: 2000, currency: 'USD' } });
  builder.addFee({ name: 'Bag', amountMinor: 400 });
  builder.addShipping({ name: 'Delivery', amountMinor: 800, taxClass: 'standard', methodId: 'flat_rate' });
  builder.setCustomer(customer);
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  const order = finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: orderCreateVersion }, taxLocation: location });
  const envelope = toOrderCreateEnvelope(order, 'device-parity', 1, { maxVersion: orderCreateVersion });
  const result = toWooOrderPayload(envelope);
  if (!('payload' in result)) throw new Error(result.error.message);
  return { order, envelope, payload: result.payload as unknown as WooPayload };
}

type WooAddress = { country?: string; state?: string; postcode?: string; city?: string };
interface WooPayload {
  meta_data: { key: string; value: unknown }[]; billing?: WooAddress; shipping?: WooAddress;
  line_items: { total: string }[]; fee_lines?: { total: string; tax_status: string }[]; shipping_lines?: { total: string }[];
}

/**
 * The server, from the evidence file's facts only: meta `_woocommerce_pos_tax_based_on` = `billing` taxes on the order's
 * billing address, `shipping` on its shipping address with no fallback, anything else on the store's tax_address; push/orders
 * passes meta_data, billing and shipping through. Core's WooCommerce engine computes the tax: `woocommerceTax.filterTaxRates`
 * matches the table against the address, `woocommerceTax.calculateTaxes` taxes each line, fee and shipping line (exclusive
 * prices, 2 decimals; shipping with the rates flagged for shipping). Every line here is standard class and every tax is a
 * whole cent, so the per-line rounding WooCommerce applies changes nothing.
 */
function serverTotals(payload: WooPayload, { ignoreMeta = false } = {}) {
  const basis = ignoreMeta ? undefined : payload.meta_data.find((meta) => meta.key === woocommerceTax.TAX_BASED_ON_META_KEY)?.value;
  const address: WooAddress = basis === 'billing' ? payload.billing ?? {} : basis === 'shipping' ? payload.shipping ?? {} : base;
  const rates = woocommerceTax.filterTaxRates(table, address.country, address.state, address.postcode, address.city);
  const cents = (total: string) => Math.round(Number(total) * 100);
  const tax = (total: string, forShipping = false) => Math.round(100 * woocommerceTax.calculateTaxes({ amount: Number(total),
    rates: forShipping ? rates.filter((each) => each.shipping) : rates, amountIncludesTax: false }).total);
  const items = [...payload.line_items, ...(payload.fee_lines ?? []).filter((fee) => fee.tax_status === 'taxable')];
  const taxMinor = items.reduce((sum, item) => sum + tax(item.total), 0)
    + (payload.shipping_lines ?? []).reduce((sum, line) => sum + tax(line.total, true), 0);
  const netMinor = [...payload.line_items, ...(payload.fee_lines ?? []), ...(payload.shipping_lines ?? [])]
    .reduce((sum, item) => sum + cents(item.total), 0);
  return { taxMinor, totalMinor: netMinor + taxMinor };
}

const metaOf = (payload: WooPayload) => payload.meta_data.find((meta) => meta.key === woocommerceTax.TAX_BASED_ON_META_KEY)?.value;
const both: CustomerSummary = { id: '7', name: 'Ann', email: 'ann@example.com', billing, shipping };

describe('WooCommerce tax on the customer\'s address, till against server (#722)', () => {
  it('(a) basis base, a customer billed in NY: the base rates, at most v7, no meta', async () => {
    const { order, envelope, payload } = await sell('base', both);
    expect(envelope.version).toBeLessThanOrEqual(7);
    expect(metaOf(payload)).toBeUndefined();
    expect(order.taxMinor).toBe(232);
    expect(serverTotals(payload)).toStrictEqual({ taxMinor: order.taxMinor, totalMinor: order.totalMinor });
  });

  it('(b) basis billing: the NY rates, v8, meta billing; the server without the meta would disagree', async () => {
    const { order, envelope, payload } = await sell('billing', both);
    expect(envelope.version).toBe(8);
    expect(metaOf(payload)).toBe('billing');
    expect(order.taxMinor).toBe(128);
    expect(serverTotals(payload)).toStrictEqual({ taxMinor: order.taxMinor, totalMinor: order.totalMinor });
    // Self-check: this test can fail. On the base, the server totals differently.
    expect(serverTotals(payload, { ignoreMeta: true }).totalMinor).not.toBe(order.totalMinor);
  });

  it('(c) basis shipping, shipped to TX: v8, meta shipping', async () => {
    const { order, envelope, payload } = await sell('shipping', both);
    expect(envelope.version).toBe(8);
    expect(metaOf(payload)).toBe('shipping');
    expect(order.taxMinor).toBe(200);
    expect(serverTotals(payload)).toStrictEqual({ taxMinor: order.taxMinor, totalMinor: order.totalMinor });
  });

  it('(d) basis shipping with only a billing address: the till falls back to billing, sends meta billing, and the server agrees', async () => {
    const { order, envelope, payload } = await sell('shipping', { id: '7', name: 'Ann', billing });
    expect(envelope.version).toBe(8);
    expect(metaOf(payload)).toBe('billing');
    expect(payload.shipping).toBeUndefined();
    expect(order.taxMinor).toBe(128);
    expect(serverTotals(payload)).toStrictEqual({ taxMinor: order.taxMinor, totalMinor: order.totalMinor });
  });

  it('(e) basis billing at order.create 7: the store\'s context, no taxAddress, the base totals', async () => {
    const { order, envelope, payload } = await sell('billing', both, 7);
    const atBase = await sell('base', both);
    expect(envelope.version).toBeLessThanOrEqual(7);
    expect((envelope.payload as OrderCreateEnvelope['payload'])).not.toHaveProperty('taxAddress');
    expect(metaOf(payload)).toBeUndefined();
    expect({ taxMinor: order.taxMinor, totalMinor: order.totalMinor }).toStrictEqual({ taxMinor: atBase.order.taxMinor, totalMinor: atBase.order.totalMinor });
    expect(serverTotals(payload)).toStrictEqual({ taxMinor: order.taxMinor, totalMinor: order.totalMinor });
  });
});

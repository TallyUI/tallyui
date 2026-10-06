import { ConnectorUnauthorizedError, StoreSettingsError, minorUnitDigits, woocommerceTax } from '@tallyui/core';
import type { ServerCapabilities, StoreSettings, SyncContext } from '@tallyui/core';

/** The highest order.create version the WooCommerce transport maps: v4's net discounts, and v5's fees, shipping and custom lines (WCPOS push/orders; orders #146, #161). */
export const WOO_ORDER_CREATE_VERSION = 5;
// The order.create version a store gets without proof of v5.
const WOO_BASE_ORDER_CREATE_VERSION = 3;
// The oldest WCPOS release with a proven v5 push (orders #146, #147).
const WOO_V5_MIN_PLUGIN_VERSION = [1, 10, 20] as const;

function atLeastVersion(value: unknown, min: readonly [number, number, number]): boolean {
  const parts = typeof value === 'string' ? /^(\d+)\.(\d+)\.(\d+)/.exec(value)?.slice(1).map(Number) : undefined;
  return !!parts && (parts[0] > min[0] || (parts[0] === min[0] && (parts[1] > min[1] || (parts[1] === min[1] && parts[2] >= min[2]))));
}

export async function wooStoreSettings(context: SyncContext): Promise<StoreSettings> {
  try {
    const init = { method: 'GET', headers: context.headers, signal: context.signal };
    const storesResponse = await fetch(`${context.baseUrl}/stores`, init);
    if (storesResponse.status === 401 || storesResponse.status === 403) {
      throw new ConnectorUnauthorizedError(`WooCommerce stores: HTTP ${storesResponse.status}`, storesResponse.status);
    }
    if (!storesResponse.ok) throw new Error(`WooCommerce stores: HTTP ${storesResponse.status}`);
    const stores = await storesResponse.json();
    if (!Array.isArray(stores) || stores.length === 0) throw new Error('WooCommerce stores: expected a non-empty array');
    const store = stores[0];
    const currency = store.currency.toUpperCase();
    const digits = minorUnitDigits(currency);
    if (typeof store.price_num_decimals === 'number' && store.price_num_decimals !== digits) {
      console.warn(`WooCommerce price_num_decimals is ${store.price_num_decimals}; the till rounds ${currency} to ${digits} digits`);
    }

    const classesResponse = await fetch(`${context.baseUrl}/taxes/classes`, init);
    if (classesResponse.status === 401 || classesResponse.status === 403) {
      throw new ConnectorUnauthorizedError(`WooCommerce tax classes: HTTP ${classesResponse.status}`, classesResponse.status);
    }
    if (!classesResponse.ok) throw new Error(`WooCommerce tax classes: HTTP ${classesResponse.status}`);
    const classes = await classesResponse.json();
    if (!Array.isArray(classes)) throw new Error('WooCommerce tax classes: expected an array');

    const taxRates: NonNullable<StoreSettings['taxRates']> = {};
    /** Simple-rate view for strategies other than `woocommerce`; the WooCommerce strategy reads `taxRates`. */
    const taxRatesPpm: StoreSettings['taxRatesPpm'] = { default: 0 };
    const settings: StoreSettings = {
      currency,
      pricesIncludeTax: store.prices_include_tax === 'yes',
      taxRoundAtSubtotal: store.tax_round_at_subtotal === 'yes',
      ...(typeof store.shipping_tax_class === 'string' ? { shippingTaxClass: store.shipping_tax_class } : {}),
      taxClassSlugs: classes.map((row) => row.slug),
      taxRates,
      taxRatesPpm,
    };
    if (store.calc_taxes !== 'yes') return settings;

    const rates: woocommerceTax.WooTaxRate[] = [];
    for (let page = 1; page <= 100; page++) {
      const response = await fetch(`${context.baseUrl}/taxes?per_page=100&page=${page}&orderby=order&order=asc`, init);
      if (response.status === 401 || response.status === 403) {
        throw new ConnectorUnauthorizedError(`WooCommerce taxes: HTTP ${response.status}`, response.status);
      }
      if (!response.ok) throw new Error(`WooCommerce taxes: HTTP ${response.status}`);
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error('WooCommerce taxes: expected an array');
      rates.push(...rows.map((row: woocommerceTax.WooTaxRate) => ({
        ...row, postcodes: row.postcodes ?? [], cities: row.cities ?? [],
      })));
      if (rows.length < 100) break;
    }

    const taxAddress = store.tax_address;
    let address = taxAddress && typeof taxAddress === 'object' && typeof taxAddress.country === 'string' && taxAddress.country.length > 0
      ? taxAddress
      : { country: store.store_country, state: store.store_state, postcode: store.store_postcode, city: store.store_city };
    if (!address.country) {
      console.warn('WooCommerce has no tax or store country; matching tax rates with an empty address');
      address = {};
    }
    const matched = woocommerceTax.filterTaxRates(rates, address.country, address.state, address.postcode, address.city);
    for (const rate of matched) {
      const slug = woocommerceTax.normalizeTaxClass(rate.class);
      (taxRates[slug] ??= []).push({
        id: rate.id,
        code: [rate.country, rate.state, rate.name || 'TAX', String(rate.priority)].filter(Boolean).join('-').toUpperCase(),
        label: rate.name,
        rate: rate.rate,
        priority: rate.priority,
        compound: rate.compound,
        shipping: rate.shipping,
      });
      const key = slug === 'standard' ? 'default' : slug;
      taxRatesPpm[key] = (taxRatesPpm[key] ?? 0) + Math.round(Number(rate.rate) * 10000);
    }
    return settings;
  } catch (error) {
    if (error instanceof ConnectorUnauthorizedError) throw error;
    throw new StoreSettingsError('failed', error instanceof Error ? error.message : String(error));
  }
}

export async function readWooCapabilities(context: SyncContext): Promise<ServerCapabilities | undefined> {
  try {
    const response = await fetch(`${context.baseUrl}/stores`, {
      method: 'GET', headers: context.headers, signal: context.signal,
    });
    if (response.status === 401 || response.status === 403) {
      throw new ConnectorUnauthorizedError(`WooCommerce stores: HTTP ${response.status}`, response.status);
    }
    if (!response.ok) return undefined;
    const stores = await response.json();
    if (!Array.isArray(stores) || !stores[0] || typeof stores[0] !== 'object' || Array.isArray(stores[0])) return undefined;
    let multiplePayments = false;
    let capabilities: unknown[] = [];
    try {
      const status = await fetch(`${context.baseUrl}/status`, {
        method: 'GET', headers: context.headers, signal: context.signal,
      });
      if (status.status === 401 || status.status === 403) {
        throw new ConnectorUnauthorizedError(`WooCommerce status: HTTP ${status.status}`, status.status);
      }
      if (status.ok) {
        const body = await status.json();
        capabilities = Array.isArray(body?.capabilities) ? body.capabilities : [];
        multiplePayments = capabilities.includes('order_payments_list');
      }
    } catch (error) {
      if (error instanceof ConnectorUnauthorizedError) throw error;
    }
    let orderCreate = capabilities.includes('order_create_v5') || capabilities.includes('order_payments_list') ? WOO_ORDER_CREATE_VERSION : WOO_BASE_ORDER_CREATE_VERSION;
    if (orderCreate === WOO_BASE_ORDER_CREATE_VERSION) {
      try {
        const response = await fetch(`${context.baseUrl}/site`, { method: 'GET', headers: context.headers, signal: context.signal });
        if (response.ok && atLeastVersion((await response.json())?.wcpos_version, WOO_V5_MIN_PLUGIN_VERSION)) orderCreate = WOO_ORDER_CREATE_VERSION;
      } catch {}
    }
    return {
      orderCreate,
      taxRounding: { granularity: 'woocommerce', roundAtSubtotal: stores[0].tax_round_at_subtotal === 'yes' },
      multiplePayments,
      // WCPOS v5 takes a fee's, shipping line's and custom line's tax_status and tax_class (orders #146, #161); it has no /tally/v1/info.
      lineTax: { none: true, classes: true },
    };
  } catch (error) {
    if (error instanceof ConnectorUnauthorizedError) throw error;
    return undefined;
  }
}

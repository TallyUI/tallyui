import { ConnectorUnauthorizedError, StoreSettingsError, minorUnitDigits, woocommerceTax } from '@tallyui/core';
import type { MoneyFormat, ServerCapabilities, StoreSettings, SyncContext } from '@tallyui/core';
import { WOO_CURRENCY_SYMBOLS } from './currency-symbols';
import { throwIfUnauthorized } from './unauthorized';

/** The highest order.create version the WooCommerce transport maps without coupons: v4's net discounts, and v5's fees, shipping and custom lines (WCPOS push/orders; orders #146, #161). A store with coupons gets 8 (`WOO_TAX_ADDRESS_ORDER_CREATE_VERSION`): 6 adds coupons (ADR-077 d4a-woo), 7 the note, 8 the tax address. */
export const WOO_ORDER_CREATE_VERSION = 5;
/** Version 7 is version 6 plus the sale note (ADR-083), mapped to WooCommerce's customer_note; a store takes it wherever it takes 6. Version 6 is version 5 plus coupons: it needs both order_create_v5 and the coupons gate. */
export const WOO_NOTE_ORDER_CREATE_VERSION = 7;
/** Version 8 is version 7 plus the tax address and the customer's addresses (#722), sent as WCPOS's `_woocommerce_pos_tax_based_on`
 *  meta with the order's billing and shipping, which push/orders already passes through; a store takes it wherever it takes 7. */
export const WOO_TAX_ADDRESS_ORDER_CREATE_VERSION = 8;
// The order.create version a store gets unless /status lists order_create_v5 (TallyUI fork), /site reports stock 2.0.4+ on the 2.0 line (then 6) or, with no capabilities list, stock 1.10.20+ (then 7).
const WOO_BASE_ORDER_CREATE_VERSION = 3;
// The first woocommerce-pos release whose coupon recalculation keeps the POS price (ADR-077 amendment 4, R2: 1.9.0, 2026-05-15).
const WOO_COUPONS_MIN_PLUGIN: readonly [number, number, number] = [1, 9, 0];
// Stock 1.10.20 took order.create v3-v7 to the cent without capability flags (20 Nov stock proof; Front desk ruling, 2026-11-20).
const WOO_ORDER_LINES_FLOOR: readonly [number, number, number] = [1, 10, 20];
// The version route stops at 7: v8's tax address is unproven, stock /stores answers `base` (20 Nov stock proof; desk ruling).
const WOO_ORDER_LINES_VERSION_CAP = 7;
// Stock 2.0.4 took order.create v3-v6 without the order_create_v5 flag (20 Nov stock 2.0.4 proof; Front desk ruling, 2026-11-20).
const WOO_ORDER_LINES_20_FLOOR: readonly [number, number, number] = [2, 0, 4];
// The 2.0 route stops at 6: v7's note and v8's tax address were never sent (20 Nov stock 2.0.4 proof; desk ruling).
const WOO_ORDER_LINES_20_CAP = 6;

/** Whether a /site wcpos_version is a WCPOS 2.0+ (ledger) store; undefined when the version cannot be read. */
export function wooLedgerVersion(version: unknown): boolean | undefined {
  const major = typeof version === 'string' ? /^(\d+)\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(version.trim())?.[1] : undefined;
  return major === undefined ? undefined : Number(major) >= 2;
}

/** True when the version is at or above the floor; a prerelease of the floor itself is below it. */
function atLeast(version: unknown, floor: readonly [number, number, number]): boolean {
  if (typeof version !== 'string') return false;
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.exec(version.trim());
  if (!match) return false;
  const parts: readonly [number, number, number] = [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
  for (let index = 0; index < parts.length; index++) {
    if (parts[index] > floor[index]) return true;
    if (parts[index] < floor[index]) return false;
  }
  return !match[4];
}

export function wooPluginSupportsCoupons(version: unknown): boolean {
  return atLeast(version, WOO_COUPONS_MIN_PLUGIN);
}

/** A plain `1.10.N` with N >= 20 and no prerelease or build suffix: the stock 1.10 line the version route serves. */
export function wooOnOrderLinesLine(version: unknown): boolean {
  return typeof version === 'string' && /^1\.10\.\d+$/.test(version.trim()) && atLeast(version, WOO_ORDER_LINES_FLOOR);
}

/** A plain `2.0.N` with N >= 4 and no prerelease or build suffix: the stock 2.0 line the version route serves, capped at 6. */
export function wooOnOrderLines20Line(version: unknown): boolean {
  return typeof version === 'string' && /^2\.0\.\d+$/.test(version.trim()) && atLeast(version, WOO_ORDER_LINES_20_FLOOR);
}

export async function wooStoreSettings(context: SyncContext): Promise<StoreSettings> {
  try {
    const init = { method: 'GET', headers: context.headers, signal: context.signal };
    const storesResponse = await (context.fetch ?? globalThis.fetch)(`${context.baseUrl}/stores`, init);
    throwIfUnauthorized(storesResponse, 'stores');
    if (!storesResponse.ok) throw new Error(`WooCommerce stores: HTTP ${storesResponse.status}`);
    const stores = await storesResponse.json();
    if (!Array.isArray(stores) || stores.length === 0) throw new Error('WooCommerce stores: expected a non-empty array');
    const store = stores[0];
    const currency = store.currency.toUpperCase();
    const moneyFormat: MoneyFormat = {
      ...(['left', 'right', 'left_space', 'right_space'].includes(store.currency_pos) ? { position: store.currency_pos } : {}),
      ...(typeof store.price_thousand_sep === 'string' ? { thousandSeparator: store.price_thousand_sep } : {}),
      ...(typeof store.price_decimal_sep === 'string' ? { decimalSeparator: store.price_decimal_sep } : {}),
      ...(Number.isInteger(store.price_num_decimals) && store.price_num_decimals >= 0 ? { decimals: store.price_num_decimals } : {}),
      ...(WOO_CURRENCY_SYMBOLS[currency] !== undefined ? { symbol: WOO_CURRENCY_SYMBOLS[currency] } : {}),
    };
    const digits = minorUnitDigits(currency);
    if (typeof store.price_num_decimals === 'number' && store.price_num_decimals !== digits) {
      console.warn(`WooCommerce price_num_decimals is ${store.price_num_decimals}; the till rounds ${currency} to ${digits} digits`);
    }

    const classesResponse = await (context.fetch ?? globalThis.fetch)(`${context.baseUrl}/taxes/classes`, init);
    throwIfUnauthorized(classesResponse, 'tax classes');
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
      calcDiscountsSequentially: (store.woocommerce_calc_discounts_sequentially ?? store.calc_discounts_sequentially) === 'yes',
      preventOverselling: store.prevent_overselling === true,
      ...(Object.keys(moneyFormat).length > 0 ? { moneyFormat } : {}),
      ...(typeof store.shipping_tax_class === 'string' ? { shippingTaxClass: store.shipping_tax_class } : {}),
      taxClassSlugs: classes.map((row) => row.slug),
      taxClasses: classes.map((row) => ({ slug: row.slug, name: typeof row.name === 'string' && row.name !== '' ? row.name : row.slug })),
      taxRates,
      taxRatesPpm,
    };
    if (store.calc_taxes !== 'yes') return settings;
    // The per-store basis WCPOS v2's till reads, not WooCommerce's woocommerce_tax_based_on option.
    settings.taxBasedOn = woocommerceTax.normalizeTaxBasedOn(store.tax_based_on);

    const rates: woocommerceTax.WooTaxRate[] = [];
    for (let page = 1; page <= 100; page++) {
      const response = await (context.fetch ?? globalThis.fetch)(`${context.baseUrl}/taxes?per_page=100&page=${page}&orderby=order&order=asc`, init);
      throwIfUnauthorized(response, 'taxes');
      if (!response.ok) throw new Error(`WooCommerce taxes: HTTP ${response.status}`);
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error('WooCommerce taxes: expected an array');
      rates.push(...rows.map((row: woocommerceTax.WooTaxRate) => ({
        ...row, postcodes: row.postcodes ?? [], cities: row.cities ?? [],
      })));
      if (rows.length < 100) break;
    }
    // Every rate, unfiltered, for an app's "all tax rates" table (#669); WooCommerce's empty country, state or list means any.
    settings.allTaxRates = rates.map((rate) => ({
      id: String(rate.id),
      name: rate.name,
      rate: rate.rate,
      location: {
        ...(rate.country ? { country: rate.country } : {}),
        ...(rate.state ? { region: rate.state } : {}),
        ...(rate.postcodes.length > 0 ? { postcodes: rate.postcodes } : {}),
        ...(rate.cities.length > 0 ? { cities: rate.cities } : {}),
      },
      taxClass: woocommerceTax.normalizeTaxClass(rate.class),
      priority: rate.priority,
      compound: rate.compound,
      shipping: rate.shipping,
    }));

    const taxAddress = store.tax_address;
    let address = taxAddress && typeof taxAddress === 'object' && typeof taxAddress.country === 'string' && taxAddress.country.length > 0
      ? taxAddress
      : { country: store.store_country, state: store.store_state, postcode: store.store_postcode, city: store.store_city };
    if (!address.country) {
      console.warn('WooCommerce has no tax or store country; matching tax rates with an empty address');
      address = {};
    }
    const text = (value: unknown): string => (typeof value === 'string' ? value : '');
    const baseTaxAddress = { country: text(address.country), state: text(address.state), city: text(address.city), postcode: text(address.postcode) };
    if (baseTaxAddress.country) settings.baseTaxAddress = baseTaxAddress;
    // The whole table, for re-taxing a sale on the customer's address: order.create 8 tells the server which address it was (#722).
    if (baseTaxAddress.country) settings.taxRateTable = rates;
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

// WCPOS 2.0.4 asks for approval when ABS(variance) > threshold for any `^\d+(\.\d+)?$` string, "0" included
// (Register_Session_Store.php:400-405). A till counts whole minor units, so the threshold is truncated, never rounded.
export function wooThresholdMinor(value: unknown, currency: unknown): number | undefined {
  if (typeof value !== 'string' || typeof currency !== 'string' || !/^\d+(\.\d+)?$/.test(value)) return undefined;
  const digits = minorUnitDigits(currency);
  const [whole, fraction = ''] = value.split('.');
  const minor = Number(whole + fraction.slice(0, digits).padEnd(digits, '0'));
  return Number.isSafeInteger(minor) ? minor : undefined;
}

export async function readWooCapabilities(context: SyncContext): Promise<ServerCapabilities | undefined> {
  try {
    const response = await (context.fetch ?? globalThis.fetch)(`${context.baseUrl}/stores`, {
      method: 'GET', headers: context.headers, signal: context.signal,
    });
    throwIfUnauthorized(response, 'stores');
    if (!response.ok) return undefined;
    const stores = await response.json();
    if (!Array.isArray(stores) || !stores[0] || typeof stores[0] !== 'object' || Array.isArray(stores[0])) return undefined;
    let multiplePayments = false;
    let capabilities: unknown[] = [];
    // undefined when /status failed; false when it answered without a capabilities array (stock 1.10.x).
    let flagged: boolean | undefined;
    try {
      const status = await (context.fetch ?? globalThis.fetch)(`${context.baseUrl}/status`, {
        method: 'GET', headers: context.headers, signal: context.signal,
      });
      throwIfUnauthorized(status, 'status');
      if (status.ok) {
        const body = await status.json();
        flagged = Array.isArray(body?.capabilities);
        capabilities = flagged ? body.capabilities : [];
        multiplePayments = capabilities.includes('order_payments_list');
      }
    } catch (error) {
      if (error instanceof ConnectorUnauthorizedError) throw error;
    }
    let coupons = false;
    let wcposVersion: unknown;
    try {
      const site = await (context.fetch ?? globalThis.fetch)(`${context.baseUrl}/site`, {
        method: 'GET', headers: context.headers, signal: context.signal,
      });
      if (site.ok) {
        const body = await site.json();
        wcposVersion = body?.wcpos_version;
        coupons = wooPluginSupportsCoupons(wcposVersion);
      }
    } catch {
      coupons = false;
    }
    const linesVersion = coupons ? WOO_TAX_ADDRESS_ORDER_CREATE_VERSION : WOO_ORDER_CREATE_VERSION;
    const fork = capabilities.includes('order_create_v5');
    // The flag decides when present; else stock 2.0.4+ gets 6 (array or not), stock 1.10.20+ with no array gets 7; a failed /status gets 3.
    const orderCreate = flagged === undefined ? WOO_BASE_ORDER_CREATE_VERSION : fork ? linesVersion
      : wooOnOrderLines20Line(wcposVersion) ? Math.min(WOO_ORDER_LINES_20_CAP, linesVersion)
      : !flagged && wooOnOrderLinesLine(wcposVersion) ? Math.min(WOO_ORDER_LINES_VERSION_CAP, linesVersion) : WOO_BASE_ORDER_CREATE_VERSION;
    const thresholdMinor = wooThresholdMinor(stores[0].variance_threshold, stores[0].currency);
    return {
      orderCreate,
      taxRounding: { granularity: 'woocommerce', roundAtSubtotal: stores[0].tax_round_at_subtotal === 'yes' },
      multiplePayments,
      coupons,
      // WCPOS v5 takes a fee's, shipping line's and custom line's tax_status and tax_class (orders #146, #161); it has no /tally/v1/info.
      lineTax: { none: true, classes: true },
      // ADR-094: only the fork's order_create_v5 store was shown to take a tax-none ±0.05 Rounding fee line, tax off and on, exclusive
      // and inclusive (22 Nov fork proofs). Stock stores declare nothing: their code was read, not tested.
      // Never on a WCPOS 2.0+ (ledger) store, whose transport refuses cashRoundings.
      ...(fork && wooLedgerVersion(wcposVersion) !== true ? { cashRounding: true } : {}),
      ...(thresholdMinor !== undefined ? { registerApproval: { thresholdMinor } } : {}),
      // WCPOS 2.0's per-store register_sessions setting: the register transport sends to sessions, movements and closures.
      ...(stores[0].register_sessions === true ? { register: 3 } : {}),
    };
  } catch (error) {
    if (error instanceof ConnectorUnauthorizedError) throw error;
    return undefined;
  }
}

import type { TaxRounding } from './connector';
import type { TaxAddress, TaxBasedOn } from '../tax/woocommerce/tax-location';
import type { WooTaxRate } from '../tax/woocommerce/types';

/** What the POS needs from the store's own settings (TV4). Read once after sign-in; the app feeds all three consumers from it. */
export interface StoreSettings {
  /** ISO 4217, upper case (the currency prices are sold in). */
  currency: string;
  /** Whether the store's catalogue prices include tax. It feeds both the connector's traits and the POS TaxProvider, so the two cannot disagree. */
  pricesIncludeTax: boolean;
  /** Tax rates for the store's location as integer parts per million (25% = 250000), keyed by the backend's tax class; `default` applies to a product with no class. Always integers: a connector rounds a backend's decimal rate once, at its edge. Structurally the same as @tallyui/pos's TaxRateMap. */
  taxRatesPpm: { default: number; [taxClass: string]: number };
  /** The backend's tax rate name per tax class (same keys as `taxRatesPpm`, including `default`), for `per_rate_group_items`' grouping (#324). Set by a connector whose rounding groups by rate name; absent otherwise. */
  taxRateCodes?: Record<string, string>;
  /** WooCommerce rates already filtered to the store's tax address; the empty class uses `standard`. `taxSettingsForLocation` (@tallyui/pos) re-derives it, with `taxRatesPpm`, for another address from `taxRateTable`. */
  taxRates?: Record<string, { id: number; code: string; label: string; rate: string; priority: number; compound: boolean; shipping: boolean }[]>;
  /** WooCommerce's "Calculate tax based on" (`tax_based_on`), normalized. Absent: the connector did not read it; the cart taxes by `taxRates` as today. */
  taxBasedOn?: TaxBasedOn;
  /** The shop base address, as WooCommerce resolves it for `base` (store country, state, city, postcode). */
  baseTaxAddress?: TaxAddress;
  /** The store's whole WooCommerce rate table, unfiltered, for re-matching by address. Absent: `taxRates` is final.
   *  `saleTaxContexts` (@tallyui/pos) re-matches only when the app passes the connector's `orderCreate` capability and it
   *  is 8 or more, since only order.create 8 tells the server which address the sale was taxed on (#722). */
  taxRateTable?: WooTaxRate[];
  /** Every tax rate the store defines, wherever it applies, for an app's "all tax rates" table (#669). Display only: the cart reads `taxRatesPpm` and `taxRates`, never this. Absent when the connector did not read the list. */
  allTaxRates?: StoreTaxRate[];
  taxRoundAtSubtotal?: boolean;
  /** WooCommerce's calculate coupon discounts sequentially setting. */
  calcDiscountsSequentially?: boolean;
  shippingTaxClass?: string;
  taxClassSlugs?: string[];
  /** Connector-specific and opaque to the app: what the connector needs to price documents. The app passes it back to the connector unchanged, and never logs it. */
  pricingContext?: Record<string, string>;
  /** Derived, never read by `storeSettings`: the store's `ServerCapabilities.taxRounding`, which `useStoreSettings` fills in (#324). */
  taxRounding?: TaxRounding;
}

/** Where a tax rate applies, in the backend's own terms. A missing field means any; a backend fills only what it has (WooCommerce: country, state as `region`, postcodes, cities). */
export interface StoreTaxRateLocation {
  /** ISO 3166-1 alpha-2, as the backend stores it. */
  country?: string;
  /** State or province code. */
  region?: string;
  /** Codes or patterns, as the backend stores them. */
  postcodes?: string[];
  cities?: string[];
  /** The backend's named tax zone, for a backend that groups its rates by zone. */
  zone?: { id: string; name: string };
}

/** One of the store's tax rates as the backend defines it. The optional fields are set by a backend that has them. */
export interface StoreTaxRate {
  /** The backend's id, as a string. */
  id: string;
  name: string;
  /** Percent as a decimal string, as the backend sends it ("7.2500"). */
  rate: string;
  location: StoreTaxRateLocation;
  /** The backend's tax class or category key, as `taxClassSlugs` and `taxRates` key it. */
  taxClass?: string;
  priority?: number;
  compound?: boolean;
  /** Whether the rate also applies to shipping. */
  shipping?: boolean;
}

/**
 * Picks among several regions, countries or sales channels when the store has more than one.
 * The app persists the choice per store, in its own settings, so it is asked once. A stored
 * choice that no longer resolves (for example, the region was deleted) raises `choice_required`
 * again instead of failing. Backends without the concept ignore a field.
 */
export interface StoreSettingsChoice {
  region?: string;
  country?: string;
  channel?: string;
}

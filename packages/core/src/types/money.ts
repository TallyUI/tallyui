/**
 * A monetary amount in integer minor units (cents for EUR/USD, yen for JPY)
 * with its ISO 4217 currency code. Integers keep arithmetic exact, and the
 * code travels with the amount so nothing assumes a store-wide currency.
 */
export interface Money {
  /** Integer amount in the currency's minor unit, e.g. 1250 for €12.50. */
  amount: number;
  /** Upper-case ISO 4217 code, e.g. 'EUR'. 'XXX' when the backend gives none. */
  currency: string;
}

/**
 * One entry in a product's price list.
 *
 * `base` is the everyday price. `sale` is a temporary reduction that replaces
 * the base price in the same currency while it applies. Backends express
 * sales differently (WooCommerce sale_price, Medusa sale price lists, Shopify
 * compare_at_price) and each connector maps its own form into these entries,
 * so components never need regular/sale/on-sale flags.
 */
export interface ProductPrice extends Money {
  kind: 'base' | 'sale';
  /** Set when the backend says so for this price; it wins over the store-level `pricesIncludeTax`. Undefined: use the store-level setting. */
  taxInclusive?: boolean;
}

/** The price to charge, and the price it replaces when a sale applies; each keeps its source's `taxInclusive` when set. */
export interface ResolvedPrice {
  current: Money & { taxInclusive?: boolean };
  /** Set only when a sale price applies: the base price it replaces. */
  was?: Money & { taxInclusive?: boolean };
}

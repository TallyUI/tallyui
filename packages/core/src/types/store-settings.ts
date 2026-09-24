/** What the POS needs from the store's own settings (TV4). Read once after sign-in; the app feeds all three consumers from it. */
export interface StoreSettings {
  /** ISO 4217, upper case (the currency prices are sold in). */
  currency: string;
  /** Whether the store's catalogue prices include tax. It feeds both the connector's traits and the POS TaxProvider, so the two cannot disagree. */
  pricesIncludeTax: boolean;
  /** Tax rates for the store's location as integer parts per million (25% = 250000), keyed by the backend's tax class; `default` applies to a product with no class. Always integers: a connector rounds a backend's decimal rate once, at its edge. Structurally the same as @tallyui/pos's TaxRateMap. */
  taxRatesPpm: { default: number; [taxClass: string]: number };
  /** Connector-specific and opaque to the app: what the connector needs to price documents. The app passes it back to the connector unchanged, and never logs it. */
  pricingContext?: Record<string, string>;
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

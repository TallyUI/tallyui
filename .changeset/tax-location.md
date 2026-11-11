---
'@tallyui/core': minor
'@tallyui/pos': minor
---

WooCommerce's tax location, the pure pieces (#722). `woocommerceTax.orderTaxLocation(base, taxBasedOn, order?)` resolves the address an order is taxed by, as `WC_Abstract_Order::get_tax_location()` does: `shipping` falls back to billing and then to the shop base, `billing` to the shop base, and the order's `_woocommerce_pos_tax_based_on` (`TAX_BASED_ON_META_KEY`) overrides the store's basis when valid; `normalizeTaxBasedOn` turns anything else into `base`. `StoreSettings` gains three optional fields a connector fills: `taxBasedOn`, `baseTaxAddress` and `taxRateTable` (the unfiltered WooCommerce rate table). `taxSettingsForLocation(settings, location)` in `@tallyui/pos` re-derives `taxRates` and `taxRatesPpm` for an address from `taxRateTable` (a class's ppm includes compound rates; a class with no matching rate is 0), and returns the settings unchanged when there is no table. Nothing uses them yet.

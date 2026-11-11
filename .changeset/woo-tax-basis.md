---
'@tallyui/connector-woocommerce': minor
---

The WooCommerce connector reads the store's tax basis and base tax address (#722, step 1). When the store calculates taxes, `wooStoreSettings` sets `taxBasedOn` from the store's `tax_based_on` in `wcpos/v2/stores` (normalised, so anything other than `base`, `billing` or `shipping` reads as `base`), and `baseTaxAddress` to the same address it already matches rates against (`tax_address` when it has a country, else the `store_*` fields), with each field a string. It leaves `baseTaxAddress` out when neither address has a country, and sets neither field when taxes are off. These fields are for display only. The connector does not fill `taxRateTable` and does not tax by the customer's address, so the rates the cart uses and every amount stay the same. Per-customer taxing comes later, together with an order.create change so that the server agrees.

---
"@tallyui/core": minor
"@tallyui/connector-medusa": minor
"@tallyui/database": minor
---

Medusa prices as Medusa charges them (ADR-060 D2b). `SyncContext` gains an optional `pricingContext` (from `storeSettings()`), `ProductPrice` an optional `taxInclusive`, and `TallyConnector.reconcile` a `calculatedPrices` slot. With a pricing context, every Medusa product document build fills each variant's `calculated_price` from the store API (`null` when the sales channel or region does not sell it), and the traits price from it: sale lists as a sale against the original price, override lists as the base price, `null` as unsellable. `reconcile.calculatedPrices` re-delivers products whose calculated prices changed with no timestamp bump; run it every `MEDUSA_CALCULATED_PRICE_RECONCILE_INTERVAL_MS` (30 minutes) with `maxPages: 1000`. Without a pricing context, documents and prices are unchanged.

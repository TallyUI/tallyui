---
"@tallyui/core": minor
"@tallyui/connector-vendure": minor
---

`TallyConnector` gains an optional `storeSettings(context, choice?)` (TV4): one read-only call for the store's currency, `pricesIncludeTax`, `taxRatesPpm` and an opaque connector-specific `pricingContext`, so the app can feed the connector's own tax-inclusivity option and the POS `TaxProvider` from a single source of truth instead of two hand-matched settings. Rejects with a `StoreSettingsError` (`choice_required` with `choices`, or `failed`).

Vendure's `storeSettings` reads the active channel's currency and `pricesIncludeTax`, and the default tax zone's enabled, non-customer-group rates keyed by tax category id (rounded to integer ppm once, at the connector's edge). `default` is the `isDefault` category's rate, or, when none is flagged, the first category Vendure's own `taxCategories` lists — the same fallback Vendure uses for a variant created without a category — and is 0 when that category has no rate in the zone. `createVendureConnector`'s `pricesIncludeTax` option is unchanged; pass `settings.pricesIncludeTax` from `storeSettings` instead of hand-matching it to the POS.

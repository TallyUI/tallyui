---
"@tallyui/connector-medusa": minor
---

`medusaConnector.storeSettings` (TV4b) reads Medusa's admin API only: the resolved region's currency and price-preference tax inclusivity, the resolved country's tax region default rate (rounded to integer ppm once, at the connector's edge; 0 with no tax region or no default rate, matching what Medusa's system provider itself charges), and a `pricingContext` (`region_id`, `currency_code`, `publishable_key`) for pricing through the store API. Region, then country, then channel (the publishable key, excluding revoked ones): the first ambiguity reports every choice known at that point, as `StoreSettingsError('choice_required')`, so the app asks once; a store with no publishable key at all rejects with `StoreSettingsError('failed')`. The publishable key is a public credential and may sit in `pricingContext`, but never appears in an error message, `choices`, or console output.

---
'@tallyui/core': minor
'@tallyui/pos': minor
'@tallyui/connector-vendure': minor
---

The Vendure connector supplies its tax rate names, so a `per_rate_group_items` store groups a sale's tax the way Vendure does (#324). Apps no longer fetch the names themselves.

- **`StoreSettings.taxRateCodes`** (core, optional): the backend's tax rate name per tax class, keyed like `taxRatesPpm`, including `default`.
- **`vendureStoreSettings`** reads each rate's `name` in the tax-rate query it already runs, so no extra request is made. Only the rates `taxRatesPpm` uses count, and `default` follows the same default-category rule. `taxRateCodes` is left out when no names come back.
- **`taxProviderProps(settings)`** passes `taxRateCodes` to `<TaxProvider>` as `rateCodes`.

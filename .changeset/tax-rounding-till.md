---
"@tallyui/core": minor
"@tallyui/pos": minor
---

`StoreSettings` gains a derived `taxRounding`. `useStoreSettings` fills it from the context's capabilities, or else from one read of the connector's `capabilities()`, and `taxProviderProps` passes it to `TaxProvider` as `rounding`, so the till rounds tax like the store with no app code (#324). `custom` passes no rounding, and an explicit `rounding` prop still wins.

---
"@tallyui/core": minor
"@tallyui/pos": minor
---

`StoreSettings` gains a derived `taxRounding`. `useStoreSettings` fills it from the context's capabilities, or else from one read of the connector's `capabilities()` made before the settings are ready, so each sign-in emits the settings once with the rounding known and no later change holds a sale; a failed read or a connector without `capabilities` gives the default rounding. `taxProviderProps` passes it to `TaxProvider` as `rounding`, so the till rounds tax like the store with no app code (#324). `custom` passes no rounding, and an explicit `rounding` prop still wins.

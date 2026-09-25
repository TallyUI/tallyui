---
'@tallyui/pos': minor
---

`@tallyui/pos` adds the neutral store-settings bootstrap every platform POS shares. `resolveStoreSettings` reads the app's stored choice, calls `connector.storeSettings`, returns `choose` with the choices on `choice_required` (the tried choice as `initial`), and saves a new pick only once it resolves. `useStoreSettings` wraps it as a hook that re-resolves on a store switch and discards stale results, with `choose(choice)` and `retry()`. `withPricingContext` and `taxProviderProps` map the settings into the replication's `SyncContext` and `<TaxProvider>`. The app keeps persistence through `loadChoice` and `saveChoice`.

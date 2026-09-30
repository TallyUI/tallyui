---
'@tallyui/pos': minor
---

A till no longer sells on a guessed tax rounding. When the store's capabilities read fails (it throws, or answers "unknown", as Vendure's does for a network error or a 5xx), `useStoreSettings` keeps the settings unresolved instead of falling back to the default rounding. It retries by itself after 5 seconds, then 10, doubling to at most 5 minutes. While it waits, the state is `error` with a `nextRetryAt`, and an app shows "Can't reach the store's settings yet. Retrying…". Only a store that reports no rounding, or a connector without `capabilities`, gets the default. Before this, a failed read on a Vendure store set to `per_rate_group_items` meant every sale raised `figures_mismatch`.

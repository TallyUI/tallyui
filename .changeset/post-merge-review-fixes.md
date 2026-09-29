---
'@tallyui/core': patch
'@tallyui/components': patch
---

`parseCommandResult` now accepts a `total_mismatch`'s `bridgeMinor` and the `tax_rate_mismatch` warning code, so a plugin replaying a stored v3 result no longer fails. `knownWarnings` is lenient about a bad optional `bridgeMinor` (dropping just that field, not the whole warning) and about a non-array `warnings` value. `OrdersList`'s rounding line now reads "Store calculated …; a rounding line of … brought it to …". `Catalogue` keeps its input array's identity when the stock overlay changes nothing, and takes the latest of `lastStockCheckAt`, the provider's `stockOverlayAsOf` and `lastSyncedAt` for its "stock as of" time.

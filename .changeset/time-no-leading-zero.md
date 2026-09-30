---
'@tallyui/components': patch
---

Times shown to a cashier no longer force a leading zero on the hour (#252): `ProductStockBadge`'s "as of" time and the catalogue's time label now read "2:49 AM", not "02:49 AM", on a 12-hour clock, like `SyncStatus` and the orders list.

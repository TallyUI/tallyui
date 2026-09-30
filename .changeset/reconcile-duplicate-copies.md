---
'@tallyui/database': patch
'@tallyui/connector-woocommerce': patch
---

A stale duplicate copy of a store product no longer stays on the till for good (#369). When two local products share one store id, the catalogue check now makes the copy its index did not pick a deletion candidate, and logs a `duplicate` event with the code `duplicate_match_key`. The copy is tombstoned only when `confirmGone` proves the store doesn't back it, and the mass-delete brake still applies. WooCommerce's `confirmGone` now also confirms a local whose id is live but whose uuid isn't the store's for that id. The store listing is the source of truth, and a later pull restores anything the store still backs.

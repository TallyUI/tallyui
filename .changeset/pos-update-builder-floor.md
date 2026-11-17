---
'@tallyui/pos': minor
---

`toOrderUpdateEnvelope` builds at order.create version 5 or more, so a reopened sale never drops the store's fees and shipping; a store capped below 5 gets `UnsupportedOrderVersionError(5, cap)`. It refuses a row without `baseRevision` or without figures, and it pairs kept items' store ids by client id rather than by position (ADR-090). `toOrderCreateEnvelope` is unchanged.

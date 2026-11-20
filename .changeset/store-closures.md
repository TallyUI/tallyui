---
'@tallyui/core': minor
'@tallyui/pos': minor
'@tallyui/connector-woocommerce': minor
---

Adds an optional, online `closures` connector surface (ADR-093): read the store's Z closures, append a recount and record a reprint. `Correction` and `ApproverCredentials` move to core (pos and the Woo connector re-export them); `Correction` gains `late_refund`, which `deriveSettled` counts on the refund side. The Woo connector implements it for WCPOS 2.0.

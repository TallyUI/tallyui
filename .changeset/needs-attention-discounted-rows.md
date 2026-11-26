---
'@tallyui/core': minor
'@tallyui/pos': minor
'@tallyui/components': patch
---

ADR-048's rounding tolerance counts discounted lines on a store that taxes each discount as its own row. `TallyConnector` gains an optional `discountsAreTaxedRows`, and `needsAttention` takes a matching option, which `OrdersList` reads from the connector. When it is set, a `total_mismatch` bridge is a notice only up to ⌈(lines + fees + shipping + discounted lines) / 2⌉ minor units, where a discounted line is one the `order.create` payload sends with `discountMinor` above 0. Without it, nothing changes. The vendurepos app must set `discountsAreTaxedRows: true` on its Vendure connector object. The vendurepos plugin must count its per-rate tolerance T from the same rows of the payload (vendurepos/app#532). The bound was probed on tax-exclusive lines of quantity 1; inclusive channels, quantity above 1, fees and shipping were not probed.

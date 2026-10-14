---
"@tallyui/pos": minor
---

Cart lines keep a variant's chosen options as `attributes` (from `VariantSummary.options`) through park, resume and reopen. `finalizeOrder` stores them on `PosOrderLine.attributes`, and receipt data carries them. The order-create envelope is unchanged: attributes still go only at version 6 (#495).

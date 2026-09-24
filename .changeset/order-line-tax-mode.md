---
"@tallyui/core": minor
"@tallyui/pos": patch
---

`OrderCreateLine` gains an optional `taxInclusive` (ADR-038 amendment 2). It is the line's own tax mode, sent only when that mode differs from the order's `pricesIncludeTax`. Single-mode orders produce byte-identical payloads. `finalize` still rejects converted lines until the Medusa plugin honours the field.

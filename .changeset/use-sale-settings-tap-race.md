---
'@tallyui/pos': patch
---

`useSale` never drops a line tapped while new store settings land (#301). The new sale that new tax settings or currency start on an idle cart now begins in a layout effect, inside the commit that brings those settings, and only when the sale is idle at that moment (no line, cart stage, no save in flight or pending), not as of the last render. Every sale change reads the current order builder, so a call from an older render never reaches a builder that `newSale()` has replaced. A line tapped once the new settings have committed lands on the new sale, priced with the new settings; a line that reaches the sale before its new sale starts keeps that sale, on its old settings.

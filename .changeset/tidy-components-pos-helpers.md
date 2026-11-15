---
'@tallyui/components': patch
---

Internal tidy: the cart tabs use `@tallyui/pos`'s `isPartlyPaid` instead of a copy, and the catalogue, stock badge and variations popover share one stock-status label table. Behaviour unchanged.

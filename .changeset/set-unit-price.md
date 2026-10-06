---
'@tallyui/pos': patch
---

OrderBuilder.setUnitPrice and useSale.setUnitPrice edit a line's unit price at the till (discounts and tax recomputed; integer, >= 0); no stored-order change.

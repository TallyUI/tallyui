---
'@tallyui/pos': patch
---

Internal tidy: `allocateOrderDiscount` uses the shared largest-remainder routine, and the order builder applies line and order discounts through one helper. Behaviour and exports unchanged.

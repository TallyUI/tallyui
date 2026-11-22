---
"@tallyui/pos": minor
"@tallyui/components": patch
---

A cash payment taken through `addTender` records its own change, so `Order.paidMinor` and `changeDueMinor` no longer include change after a cash overpay; a cash payment with nothing due is refused.

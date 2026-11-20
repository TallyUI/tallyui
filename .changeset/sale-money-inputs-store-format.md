---
'@tallyui/components': patch
---

ChargeForm reads amounts in the store's money format. ChargeForm and CashTendered prefill with the store's decimal separator, so an edited prefill is never read as a thousands group.

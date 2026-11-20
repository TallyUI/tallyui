---
'@tallyui/components': minor
---

PriceForm, DiscountForm, RefundForm and CashTendered read typed money in the store's separators from MoneyFormatProvider. `parsePrice` and `parseDiscount` take an optional trailing format. Without a format, parsing is unchanged; extra decimal places are still refused, never rounded (#672).

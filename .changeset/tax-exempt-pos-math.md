---
'@tallyui/pos': minor
---

Tax exempt math and sale state, behind the store's `taxExempt` capability. `useSale` gains `taxExempt`, `taxExemptAvailable` and `setTaxExempt(on)`. Exemption is order-level: every line, fee and shipping row keeps its net and carries zero tax, inclusive-priced items included, and the order total is the sum of those nets. It can be turned on only before a payment is captured, and turned off with payments taken (the amount due rises). It is refused while saving, with a payment in motion, on the receipt, on an after-close sale and with a carried coupon (TAX_EXEMPT_UNAVAILABLE, TAX_EXEMPT_PAYMENT_TAKEN, TAX_EXEMPT_LOCKED). Coupons are priced against the taxed sale. Parking keeps the exemption. A resume on a store that no longer accepts exemption restores the taxed sale and shows TAX_EXEMPT_REMOVED. Reopening a refused exempt sale keeps the exemption. Finalize refuses an exempt sale on a prices-include-tax store. Nothing changes for a sale that is not exempt.

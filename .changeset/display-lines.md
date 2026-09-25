---
"@tallyui/pos": minor
"@tallyui/components": minor
---

`order.display` gains `lines` and `orderDiscountMinor` (ADR-063). Each line shows its amount before any discount, with its own discounts as sub-rows, all in the display mode. The order discounts appear as one row, not allocated to the lines. Every discount row is its own-mode amount converted on its own, so it's exact. `display.subtotalMinor` is now derived from the total and the discount rows, so `Σ lines === subtotalMinor` and `Σ sub-rows + orderDiscountMinor === discountMinor` hold exactly. Single-mode carts show the same figures as before; mixed-mode carts can shift by about a cent, carried by the last converted line's amount.

`ReceiptLineItem` gains `displayAmountMinor` and `displayDiscounts`, and `ReceiptData` gains `orderDiscountMinor`. Print these above the subtotal. `lineTotalMinor` is unchanged: it's after every discount and is kept for existing readers.

`CartTotal` now orders its rows Subtotal / Discount / Tax / Total, matching the receipt, and takes an optional `taxInclusive`, which labels the tax rows "incl." instead of adding them.

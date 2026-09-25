---
"@tallyui/pos": minor
---

`Order` gains `display: DisplayTotals` (ADR-063): the cart's subtotal before discounts, the discount, the tax and the total in the store's display mode, which add up on screen even in a mixed-mode cart. The settlement figures (`subtotalMinor`, `discountMinor`, `taxMinor`, `totalMinor`) and the `order.create` payload are unchanged; `display` is never sent to the server; a parked draft may carry it, but it is recomputed on resume.

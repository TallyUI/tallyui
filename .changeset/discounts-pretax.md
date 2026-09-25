---
"@tallyui/core": minor
"@tallyui/pos": minor
---

Discounts are pre-tax (ADR-062). An order discount is allocated across the lines in proportion to their own-mode amounts (the new `allocateOrderDiscount`, largest-remainder rounding), each line carries its share in `orderDiscountMinor` and is taxed after it, so an order discount now lowers the tax instead of coming off the total after tax. A discounted `order.create` is version 2, with `discountMinor` on each discounted line and on the payload; a discount-free payload stays version 1, byte-identical. `finalize` still rejects discounts until the plugins honour version 2. Receipt lines show their `discountMinor`.

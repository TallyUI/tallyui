---
"@tallyui/components": minor
"@tallyui/pos": minor
---

The cart line's Price form can show WCPOS v2's quick-discount keys (`quickDiscounts` on `PriceForm` and `Cart`): a key takes its percentage off the line's current price and Apply writes it. The pos app settings gain `cart.quickDiscounts`, defaulting to v2's `[5, 10, 15]` and keeping only percentages above 0 and up to 100.

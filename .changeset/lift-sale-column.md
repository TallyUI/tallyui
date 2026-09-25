---
"@tallyui/components": minor
---

Lifted medusapos's cart, phone cart bar, discount form and tender screen into `@tallyui/components` (`Cart`, `CartBar`, `Tender`, `DiscountForm`, `DiscountChips`, `parseDiscount`, `discountLabel`), so every platform POS gets the same sale-column UI (ADR-052, TV6a). `Cart` takes an optional `taxLabel?: (ratePpm: number) => string` (default `` `Tax ${ratePpm / 10000}%` ``), since VAT isn't universal. `@tallyui/components` gains a runtime dependency on `@tallyui/pos`, for types and the pure `buildReceiptData` only — components still render from props alone.

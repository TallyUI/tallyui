---
'@tallyui/pos': major
---

**Breaking:** removes the floating-point money and rate paths.
- `calculateTax`, `extractTax`, `addTax`, `TaxResult` and `formatCurrency` are deleted. Use the exact tax API (`computeOrderTax`, `taxMicros`) and `formatMoney`.
- `TaxContext.getTaxRate()`, which returned a fraction, is replaced by `getTaxRatePpm()`, which returns integer parts per million.
- `TaxProvider` takes `ratesPpm` and validates it.
- `useCurrencyFormatter()` now formats `Money`, and `useCurrencyCode()` is added.

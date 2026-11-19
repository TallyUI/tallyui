---
"@tallyui/pos": minor
---

`createClosureContext({ currency, store, … })` builds the `ClosureContext` for `buildClosureDocument` and `buildXReportDocument`. It has one money formatter (`formatDecimalMoney`, at the currency's minor-unit digits) and English defaults for every closure label (`ENGLISH_CLOSURE_LABELS`), so apps no longer assemble it by hand.

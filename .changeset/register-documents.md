---
"@tallyui/pos": minor
---

Add the register's closure and X-report documents (`buildClosureDocument`, `buildXReportDocument`, `formatClosureDate`, `ClosureContext`) and register facts (`RegisterFact`, `recordRegisterFact`), ported from WCPOS `next` (ADR-032). The documents use WCPOS's own receipt-template envelope shape, so its shipped templates and renderer can be copied in later; a pinned key-tree snapshot against WCPOS's closure fixture guards that shape until then. Facts log through TallyUI's own logger (`@tallyui/pos`'s `logging` module) instead of `@wcpos/utils/logger`. `minorToDecimal` moves out of `exportCsv` into a shared `register` helper so both reuse it.

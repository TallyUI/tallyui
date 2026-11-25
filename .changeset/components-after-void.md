---
"@tallyui/components": minor
---

`afterVoid(leg, voided)` on `TenderLedger`, `TenderPane`, `Tender` and Cart's `tenderLedger`: runs after a void that `beforeVoid` approved, with `voidTender`'s result, so a host reverses a journalled void the till refused. A leg's `beforeVoid` now runs once across every mounted ledger and the cancel-payment view (#1271).

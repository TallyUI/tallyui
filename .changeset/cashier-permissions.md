---
'@tallyui/core': minor
'@tallyui/pos': minor
---

Adds cashier permissions: a connector may describe the signed-in cashier with an optional `cashier()` that returns neutral permissions (`viewReports`, `manageClosures`, `approveVariance`, `refund`, `discount`). In `@tallyui/pos`, `can()` and the `useCashier` hook read them and give the blind-count flag and a Reports gate; a connector without `cashier()` still allows everything, as before.

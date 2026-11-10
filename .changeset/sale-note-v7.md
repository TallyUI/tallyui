---
"@tallyui/core": minor
"@tallyui/pos": minor
---

A cashier can now add a note to a sale with `useSale().setNote()`; it is kept when the sale is parked and resumed, and cleared by a new sale. The note is sent to the store as `order.create` version 7, only to servers that advertise version 7 (ADR-083).

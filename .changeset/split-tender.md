---
'@tallyui/pos': minor
---

Split tender: `useSale().addTender()` and `removeTender()` take several payments for one sale. Change comes only from cash, and a card tender is capped at the balance due (ADR-072). `setTender` now replaces every payment with the one given.

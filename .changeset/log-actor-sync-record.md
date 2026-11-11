---
'@tallyui/pos': minor
---

Log entries can now say who did something (`actor`) and how one record's sync went (`syncRecord`). Register events carry the cashier, and the order outbox logs each order the store accepts, refuses or keeps failing. New `presetFilters`, `hasActor` and `deriveStuckRecords` helpers let a Logs screen show a person's actions and the orders that are still stuck (#656).

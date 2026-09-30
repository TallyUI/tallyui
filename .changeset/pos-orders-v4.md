---
"@tallyui/pos": minor
"@tallyui/components": minor
---

Migrate pos_orders to version 4 with optional localWarnings and serverFailures. Record omitted customer details and dropped payment references on the stored order, and show these warnings in the orders list; serverFailures is declared for the next outbox update.

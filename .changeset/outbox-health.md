---
"@tallyui/pos": minor
---

The register outbox now counts the till updates the store rejected that hold up their register (`state.rejected`), and `requeue()` sends a rejected till update again under its own command id, except for the refusals the store records or that have their own exits (#366). The new `summarizeOutboxHealth`, `watchOutboxHealth` and `useOutboxHealth` give one summary of sales and till updates waiting, rejected or stuck, and whether either outbox needs the cashier to sign in again, with one `flush()` for both (#373).

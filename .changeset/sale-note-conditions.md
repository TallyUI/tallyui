---
"@tallyui/pos": minor
"@tallyui/components": minor
---

A reopened refused sale now keeps only the cashier's own note, so the "Refused by the store" text never goes out with `order.create` 7. New `noteDelivery(order)` tells whether a stored sale's note was sent, and `Receipt` and `OrdersList` show the note and say when it couldn't be sent to the store.

---
'@tallyui/components': patch
'@tallyui/pos': patch
---

Show the unsendable-update message and Retry for pending reopened sales. Tell cashiers to reopen again after a reopen-required or revision-conflict rejection, and offer Retry only when the outbox can requeue the order.
The unsendable-update message now tells the cashier what to do.

---
'@tallyui/pos': patch
---

`useOrderOutbox`'s `record()` now resolves only once the outbox's pending count includes the order, so a screen that renders on resolve no longer shows one frame without its pending sale.

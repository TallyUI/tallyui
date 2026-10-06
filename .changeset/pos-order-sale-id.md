---
'@tallyui/pos': minor
---

The stored order keeps the sale's id as `saleId` (`pos_orders` version 7, ADR-072; never sent). Version 7 is one-way: a till that opens 3.1.0 can't go back to 3.0.x.

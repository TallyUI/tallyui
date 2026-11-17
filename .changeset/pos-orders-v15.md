---
'@tallyui/pos': minor
---

`pos_orders` goes to schema version 15 (identity migration, one-way, ADR-090): `baseRevision` may be 128 characters, and a sale may store `refundDueMinor`. Nothing writes `refundDueMinor` yet. The store-order rebuild accepts a revision of up to 128 characters, down from 255.

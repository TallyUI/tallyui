---
'@tallyui/core': minor
'@tallyui/pos': minor
'@tallyui/connector-vendure': minor
---

A fee or shipping charge entered in a mode other than the store's is sent in its own mode (`amountIncludesTax`), but only to a store whose connector declares `chargeTaxMode`. connector-vendure maps `/tally/v1/info`'s `chargeTaxMode: { v: 1 }`.

This ends the one-cent drift of an inclusive fee in a tax-exclusive Vendure store. Without the capability, nothing changes.

pos_orders moves to schema version 23 (identity migration).

---
'@tallyui/pos': minor
'@tallyui/components': minor
---

`buildReceiptData` returns the WCPOS receipt schema 1.4 version (`RECEIPT_SCHEMA_VERSION`) and its `software`, `register` and `fiscal` blocks with 1.4 defaults; `ReceiptConfig` takes `registerName`, `software` and `fiscal`. `Receipt` takes `registerName` and prints `Register: <name>` when given (#474).

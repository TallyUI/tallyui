---
'@tallyui/core': minor
'@tallyui/connector-woocommerce': patch
---

A WooCommerce product whose uuid changed in the store is replaced on the till in one pass (#331). The till delivers it under its new uuid and removes the old copy. Before this fix, it removed the old copy and dropped the new one, so the product was missing until the next daily check, and it was removed without the usual by-id check.

- **The reconcile feed:** when an entry that has a local copy is fetched back under a different primary key but the same remote id, the feed delivers that document as well as removing the old copy.
- **`combinePullAdapters`** takes an optional `key` for resolving duplicates across its sub-adapters. It defaults to `doc.id`, as before. WooCommerce passes the uuid (its primary key): two documents that share a store id, such as a product's new copy and its old copy's removal, must both reach the collection.

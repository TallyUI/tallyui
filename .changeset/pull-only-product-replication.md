---
'@tallyui/connector-medusa': minor
'@tallyui/connector-woocommerce': minor
'@tallyui/connector-vendure': minor
'@tallyui/connector-shopify': minor
---

Product replication adapters are now pull-only. The `push` handler is removed from `medusaProductReplication`, `wooProductReplication`, `vendureProductReplication` and `shopifyProductReplication`. Catalogue data is server-owned, so the POS never writes products. The old push handlers also turned every HTTP or network error into a fake conflict, which made RxDB silently revert local edits.

This removes a public member. Nothing in TallyUI called it, but code that called `adapter.push` directly must stop doing so.

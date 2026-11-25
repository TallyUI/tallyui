---
'@tallyui/connector-woocommerce': patch
'@tallyui/pos': minor
'@tallyui/components': minor
---

A WooCommerce POS 2.0 sale the store refused after it had created the order now says so. The transport adds the order's `displayId` next to `orderId` in the refusal's `error.data`. The new `storeOrderLeft` in `@tallyui/pos` reads that order's reference and how much was recorded on it at the refusal. `OrderSyncNotices` shows it under the refusal sentence ("Order #1001 was left pending on the online store. Nothing was paid there.", or "left part paid" with the amount and the total), and uses the general refusal sentence in place of `invalid_payload`'s for such a sale. `needsAttention` keeps such a sale even when it was marked handled.

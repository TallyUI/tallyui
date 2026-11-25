---
'@tallyui/core': minor
'@tallyui/connector-woocommerce': minor
---

Adds `TallyConnector.settleRefusedOrder` with the `SettleOutcome`, `SettleCancelRequest` and `RefusedOrderSettlement` types, and the WooCommerce `settleRefusedOrder.cancel`: it reads the order the store created before refusing a sale through a WCPOS 2.0 read push, and cancels it with the revision that read returned only when the store's record shows nothing paid and the order is still pending or open; otherwise it answers `changed`, `refused`, `gone` or `retry`.

---
"@tallyui/core": minor
"@tallyui/connector-woocommerce": minor
---

`@tallyui/core` gains the optional, online, read-only `TallyConnector.listRefunds` member, its `StoreRefund`, `StoreRefundOrphan`, `ListRefundsQuery` and `StoreRefundPage` types, and `StoreRefundsUnsupportedError`, so refunds can be dated by when they were made (ADR-081 decision 7).

`@tallyui/connector-woocommerce` implements `listRefunds` over WCPOS 2.0's `wcpos/v2/refunds` read, reading each refund's currency from its order and rejecting with `StoreRefundsUnsupportedError` below WCPOS 2.0.0.

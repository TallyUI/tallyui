---
'@tallyui/core': minor
---

order.create version 9 (#790): `OrderCreateCoupon.lines` (`OrderCreateCouponLine`) carries each coupon's share of each line. `SUPPORTED_ORDER_CREATE_VERSIONS` adds 9, `precheckCommand`, `payloadShapeErrors` and `payloadBoundErrors` check it (docs/contract/order-create-v9.md), and version 9 needs no `taxAddress`.

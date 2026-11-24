---
"@tallyui/core": minor
"@tallyui/connector-woocommerce": minor
---

`StoreOrder.cashierId`, `storeId` and `registerId` (all optional) name the cashier, store and register the store records for an order, as `ListOrdersQuery` filters them. WooCommerce reads `_pos_user`, `_pos_store` (a WordPress id; 0 means none) and `_wcpos_register` (written only by WCPOS, so absent on orders TallyUI rings).

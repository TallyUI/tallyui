---
"@tallyui/core": minor
"@tallyui/connector-woocommerce": minor
"@tallyui/pos": minor
"@tallyui/components": minor
---

Order history and reprint (G7, ADR-081). `TallyConnector` gains optional `listOrders` and `getOrders`, which read the store's orders online as `StoreOrder`s, with the store's line ids and prior refunds; a connector without them is unchanged. The WooCommerce connector implements both over WCPOS `wcpos/v2/orders`. `@tallyui/pos` adds `buildReceiptDataFromPosOrder` and `buildReceiptDataFromStoreOrder`, which build a receipt marked as a reprint (`fiscal.is_reprint`, `reprint_count`) from a stored order, and `Receipt` takes a prebuilt `receipt` and a `doneLabel`.

---
'@tallyui/connector-vendure': minor
---

The Vendure connector now provides `listOrders` and `getOrders`, so the shared order history and receipt reprint work on Vendure. It maps Vendure's orders to `StoreOrder` (new `toVendureStoreOrder`, `createVendureOrders` and `listVendureOrderDetails`); pass `tallyFields: false` to `createVendureConnector` on a server without the vendurepos plugin.

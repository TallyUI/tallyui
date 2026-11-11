---
'@tallyui/core': minor
'@tallyui/pos': minor
'@tallyui/connector-woocommerce': minor
---

order.create version 8 taxes a sale on the customer's address (#722, step 2). Version 8 is version 7 plus `payload.taxAddress` (`'billing'` or `'shipping'`, the address the till matched the rates against) and the customer's `billing` and `shipping` addresses. A till sends 8 only when a sale was taxed on one of the customer's addresses, and never downgrades such a sale: capped below 8, `toOrderCreateEnvelope` throws `UnsupportedOrderVersionError(8, cap)` and the outbox sends it at 8, never at a version whose server would tax it on the base. A sale taxed on the base sends the same bytes as before. The server precheck refuses `taxAddress` or customer addresses below 8, and 8 without `taxAddress`.

`@tallyui/pos`: `saleTaxContexts(settings, { orderCreateVersion })` re-matches rates by the customer's address only from order.create 8 (`TAX_ADDRESS_ORDER_CREATE_VERSION`); without the option, or below 8, every customer gets the store's context. `finalizeOrder` takes `taxLocation` and stores the tax address with the customer's addresses. `useSale` refuses a customer whose rates differ from the sale's once tender has begun (`CUSTOMER_RETAX_REFUSED`). `pos_orders` moves to schema 12; its migration is the identity, and a schema-11 till opening a schema-12 store finds no orders.

`@tallyui/connector-woocommerce`: `wooStoreSettings` fills `taxRateTable` whenever the store has a base address and advertises order.create 8 where it advertised 7. `toWooOrderPayload` sends a version-8 sale's tax address as WCPOS's `_woocommerce_pos_tax_based_on` meta, with the customer's billing and shipping addresses.

---
'@tallyui/core': minor
'@tallyui/pos': minor
'@tallyui/connector-woocommerce': patch
---

Adds the plumbing for a tax-exempt sale: `ServerCapabilities.taxExempt` and order.create's optional `taxExempt: true`, sent at the order's content version only to a store whose connector declares it. `precheckCommand` refuses it from a server without the capability and on order.update, and an exempt payload must carry no tax. No connector declares it yet, and the WooCommerce transport refuses an exempt sale. Nothing changes for any other sale.

pos_orders moves to schema version 24 (identity migration).

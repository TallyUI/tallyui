---
'@tallyui/core': minor
'@tallyui/pos': minor
---

`@tallyui/core`: order.create version 12 is 11 plus `customer.taxIds`, a catalogue line's `sku` and order `meta`, as informational fields, with their shape and bound checks in `precheckCommand` and the `ORDER_TAX_IDS_MAX`, `ORDER_TAX_ID_TYPE_MAX`, `ORDER_TAX_ID_VALUE_MAX`, `ORDER_META_MAX`, `ORDER_META_KEY_MAX` and `ORDER_LINE_SKU_MAX` constants (ADR-092).

`@tallyui/pos`: the till sends a sale's tax ids, meta and edited catalogue SKU at order.create 12 (`INFORMATIONAL_EXTRAS_ORDER_CREATE_VERSION`, now `ORDER_CREATE_MAX_VERSION`) only when the store's cap allows it, and `pos_orders` goes to schema 18 (identity migration, one-way like 17) to store them and `attentionHandledFor`.

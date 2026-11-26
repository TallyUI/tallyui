---
'@tallyui/core': minor
'@tallyui/components': minor
'@tallyui/connector-medusa': minor
---

Refunds price from an order line's as-sold figures when the store sends them: `StoreOrderLine` gains optional `soldTotalMinor`, `soldTaxMinor` and `returnedQuantity`, which connector-medusa maps from MedusaPOS plugin contract 7. A connector may declare `lineTotalsShrinkOnReturn` (connector-medusa does); the refund form then refuses a partial refund of a line without sold figures and asks for the store plugin to be updated. New `useOptionalConnector()`. Other connectors are unchanged.

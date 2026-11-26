---
'@tallyui/connector-vendure': minor
---

The Vendure connector declares `discountsAreTaxedRows: true`, so the till's ADR-048 rounding tolerance counts discounted lines on Vendure stores (#1402). An app that builds its connector with `createVendureConnector` needs no change.

---
'@tallyui/connector-vendure': patch
---

A Vendure store order now carries `taxExempt: true` when the plugin marked the order exempt in its `tallySnapshot`, so a store reprint prints the Tax exempt line.

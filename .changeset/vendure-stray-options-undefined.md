---
'@tallyui/connector-vendure': patch
---

A Vendure variant whose options all name groups the product does not have now gives `options: undefined`, as a product with no option groups does, instead of `{}`.

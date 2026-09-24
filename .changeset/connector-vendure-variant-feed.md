---
"@tallyui/connector-vendure": minor
---

Add a variant feed, `replication.productVariantFeed`, that re-delivers parent products whose variants changed. Vendure does not bump `Product.updatedAt` on a variant price or stock edit, so the product feed alone misses those changes. Start it as a second replication on the `products` collection with its own identifier.

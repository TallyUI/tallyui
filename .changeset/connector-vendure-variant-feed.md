---
"@tallyui/core": minor
"@tallyui/connector-vendure": minor
---

Add `combinePullAdapters` to `@tallyui/core`: it combines several pull adapters into the one adapter a collection replicates with, calling them one after another with a checkpoint per sub-adapter. Two replications on one collection can skip each other's pulled versions, so run one per collection.

Vendure's `replication.products` now includes a variant feed that re-delivers parent products whose variants changed. Vendure does not bump `Product.updatedAt` on a variant price or stock edit, so the product feed alone misses those changes. An existing install's product-feed checkpoint carries over; the variant feed runs one full pass on first sync.

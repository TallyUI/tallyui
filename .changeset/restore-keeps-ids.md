---
'@tallyui/pos': minor
---

A restored draft (resume, re-tax, a reopened store order) keeps every line, discount, fee, shipping and payment id and its `createdAt`, so a re-tax no longer renews ids and a store-priced coupon survives it. The builder's add and apply inputs, and `OrderBuilderOptions`, take an optional `id` / `createdAt`; a taken id throws.

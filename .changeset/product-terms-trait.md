---
'@tallyui/core': minor
'@tallyui/pos': minor
---

`@tallyui/core` adds the `ProductTerm` type and an optional `getTerms` product trait, so a connector can report a product's terms (facet values, tags, brands) each in its group; without it a product has no terms.
`@tallyui/pos` adds `productTerms`, `listTermGroups` (each group and term once, sorted by name like `listCategories`) and `hasTerm`.

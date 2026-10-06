---
"@tallyui/core": minor
"@tallyui/connector-woocommerce": minor
---

Variation attributes through the product traits (#494). Core adds `VariantSummary.options` (the variant's value in each option group, keyed by group name; a group the variant accepts any value of has no key), the `VariantOptionGroup` type and the optional `ProductTraits.getVariantOptions` (the option groups in the backend's display order). The WooCommerce connector implements both: groups are the parent's attributes with `variation: true`, by `position`, with an `id` only for global attributes; replication now keeps each variation attribute's numeric `id`. Additive: no schema change, and variations stored before this release gain the id when they are next pulled.

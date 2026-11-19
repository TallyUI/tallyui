---
'@tallyui/connector-vendure': minor
---

Vendure products now carry their option groups: `getVariants` gives each variant's `options` keyed by group name (a cart line reads "Size: 32"), and the new `getVariantOptions` lists the groups and their values in the order the API returns them for the catalogue's option pickers. The products schema goes from version 2 to 3, so the products collection drops and resyncs once on upgrade (ADR-060 amendment 9); orders, register sessions and stock levels on the till are kept. Take the upgrade on a till while it is online, so the catalogue refills straight away.

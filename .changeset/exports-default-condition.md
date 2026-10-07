---
"@tallyui/components": patch
"@tallyui/core": patch
"@tallyui/database": patch
"@tallyui/pos": patch
"@tallyui/primitives": patch
"@tallyui/storage-sqlite": patch
"@tallyui/theme": patch
"@tallyui/connector-medusa": patch
"@tallyui/connector-shopify": patch
"@tallyui/connector-vendure": patch
"@tallyui/connector-woocommerce": patch
---

Every exports entry gains a `default` condition so CommonJS and `require`-condition resolvers (Node `require`, webpack, Snack's bundler) resolve the packages; `smoke:pack` checks `require.resolve` for every entry.

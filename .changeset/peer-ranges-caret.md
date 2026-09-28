---
"@tallyui/components": patch
"@tallyui/database": patch
"@tallyui/pos": patch
"@tallyui/connector-medusa": patch
"@tallyui/connector-shopify": patch
"@tallyui/connector-vendure": patch
"@tallyui/connector-woocommerce": patch
---

Internal `@tallyui/*` peer dependencies are published as a caret range (for example `^2.1.0`) instead of an exact version. The packages still release together at one version.
